import awsIot from 'aws-iot-device-sdk'
import jwt from 'jsonwebtoken'
import mqtt from 'async-mqtt'

/**
 * Abstract superclass for cloud provider's IoT data messaging.
 *
 * Use Messenger.create() (defined at bottom) to create an instance of the
 * appropriate subclass.
 */
export default class Messenger {
    /** Establishes 'defaultConsumerTopic' as fallback messaging topic to publish data to cloud. */
    constructor() {
        this.defaultConsumerTopic = 'sensors'
    }

    /**
     * Connects to the cloud providers messenging facility. Must establish
     * this connection before any messaging.
     */
    async connect() {
        throw new Error("Abstract method")
    }

    /**
     * Connects to the cloud providers messenging facility. Must establish
     * this connection before any messaging.
     *
     * This method remains for historical reasons. Prefer use of connect().
     */
    connectSync() {
        throw new Error("Abstract method")
    }

    /**
     * Provides the topic used to send data to the cloud provider's messaging
     * facility. By default uses the 'CLOUD_CONSUMER_TOPIC' environment variable,
     * but subclasses may override as needed.
     */
    createConsumerTopic() {
        return process.env.CLOUD_CONSUMER_TOPIC
    }

    /**
     * Verify that *all* expected environment variables from registration exist.
     */
    isRegistrationComplete() {
        return false
    }

    /**
     * Determines if this messenger use connectSync() rather than connect().
     *
     * This method will be removed when connectSync() is removed.
     */
    isSyncConnect() {
        return false
    }

    /**
     * Verify that *none* of the expected environment variables from registration exist.
     */
    isUnregistered() {
        return true
    }

    /**
     * Publishes the message to the cloud provider on the provided topic.
     */
    publish(topic, message) {
        throw new Error("Abstract method")
    }
}

/** Messenger for AWS IoT Core. */
class AwsMessenger extends Messenger {
    connectSync() {
        console.log(`Connecting to host ${process.env.AWS_DATA_ENDPOINT}`)
        this.mqtt = awsIot.device({
            privateKey: Buffer.from(process.env.AWS_PRIVATE_KEY, 'base64'),
            clientCert: Buffer.from(process.env.AWS_CERT, 'base64'),
                caCert: Buffer.from(process.env.AWS_ROOT_CA, 'base64'),
              clientId: process.env.RESIN_DEVICE_UUID,
                  host: process.env.AWS_DATA_ENDPOINT,
            })
        this.mqtt.on('connect', function () {
            console.log("Connected to IoT Core messaging")
        })
    }

    isRegistrationComplete() {
        return process.env.AWS_PRIVATE_KEY
                && process.env.AWS_CERT
                && process.env.AWS_ROOT_CA
    }

    isSyncConnect() {
        return true
    }

    isUnregistered() {
        return !process.env.AWS_PRIVATE_KEY
                && !process.env.AWS_CERT
                && !process.env.AWS_ROOT_CA
    }

    publish(topic, message) {
        //console.log(`Messenger pub: ${message.toString()}`)
        this.mqtt.publish(topic, message)
    }

    toString() {
        return "AWS cloud messenger"
    }
}

/**
 * Messenger for GCP IoT Core. Uses Elliptic Curve keys for efficiency. Also
 * uses the LTS IoT Core MQTT host at 'ltsapis.goog'. Messaging token lifetime
 * defaults to maximum of 24 hours.
 *
 * At time of writing (2022-01), GCP_RENEWAL_START environment variable is not
 * documented to avoid user confusion. Presently it only helps us avoid problems with
 * time skew relative to IoT Core at renewal time by renewing before expiration
 * time. GCP_RENEWAL_START will be more valuable if we set up a replacement MQTT
 * connection like the 'mqtt' instance variable *before* ending the current connection.
 * This overlap will ensure we never lose connection to IoT Core.
 */
class GcpMessenger extends Messenger {
    constructor() {
        super()
        this.defaultConsumerTopic = 'events'

        this.mqttParams = {
          host: 'mqtt.googleapis.com',
          port: 8883,
          clientId: process.env.GCP_CLIENT_PATH,
          username: 'unused',
          protocol: 'mqtts',
          secureProtocol: 'TLSv1_2_method'
        }

        if (!process.env.GCP_TOKEN_LIFETIME) {
            process.env.GCP_TOKEN_LIFETIME = 24 * 60
        }
        // Adapt default renewal start time if token lifetime is short; probably for testing.
        if (!process.env.GCP_RENEWAL_START) {
            if (process.env.GCP_TOKEN_LIFETIME >= 20) {
                process.env.GCP_RENEWAL_START = 15
            } else {
                process.env.GCP_RENEWAL_START = 1
            }
        }
    }

    /**
     * Connects to GCP messaging. Sets 'connected' property on success. Caller
     * must catch errors.
     */
    async connect() {
        console.log(`Connecting to host ${this.mqttParams.host}`)

        let params = Object.assign({ password: this.createJwt(process.env.GCP_PROJECT_ID, 'ES256') },
                                   this.mqttParams)
        //console.debug("GCP connect params:", JSON.stringify(params))
        this.mqtt = await mqtt.connectAsync(params)
        this.connected = true
        setTimeout( async () => { await this.reconnect() }, (process.env.GCP_TOKEN_LIFETIME - process.env.GCP_RENEWAL_START) * 60 * 1000)
        console.log("Connected to IoT Core messaging");
    }

    /** Create JWT required for IoT Core renewal. */
    createJwt(projectId, secureAlgorithm) {
        const token = {
          iat: parseInt(Date.now() / 1000),
          exp: parseInt(Date.now() / 1000) + process.env.GCP_TOKEN_LIFETIME * 60,
          aud: projectId
        }
        return jwt.sign(token, Buffer.from(process.env.GCP_PRIVATE_KEY, 'base64'),
                        { algorithm: secureAlgorithm})
    }

    createConsumerTopic() {
        return `${process.env.GCP_DATA_TOPIC_ROOT}/${process.env.CLOUD_CONSUMER_TOPIC}`
    }

    /**
     * Close current connection to GCP if any, and reconnect. Implements required
     * refresh of JWT token.
     *
     * Tries to connect three times; exits the process if fails. Best to just try
     * to restart the process in this case.
     */
    async reconnect() {
        console.log("Refreshing GCP messaging token")
        let count = 0
        const maxTries = 3
        const delay = 5
        do { 
            try {
                count++
                if (this.connected) {
                    await this.mqtt.end()
                    this.connected = false
                }
                await this.connect()
                break
            } catch(e) {
                console.warn("Cannot connect to GCP:", e)
                if (count < maxTries) {
                    console.log(`Retry in ${delay} seconds`)
                    await new Promise(r => setTimeout(r, delay * 1000))
                } else {
                    console.warn(`Retries exhausted`)
                }
            }
        } while(count < maxTries)

        if (!this.connected) {
            process.exit(1)
        }
    }

    isRegistrationComplete() {
        return process.env.GCP_PRIVATE_KEY
                && process.env.GCP_CLIENT_PATH
                && process.env.GCP_DATA_TOPIC_ROOT
                && process.env.GCP_PROJECT_ID
    }

    isUnregistered() {
        return !process.env.GCP_PRIVATE_KEY
                && !process.env.GCP_CLIENT_PATH
                && !process.env.GCP_DATA_TOPIC_ROOT
                && !process.env.GCP_PROJECT_ID
    }

    publish(topic, message) {
        //console.log(`Messenger pub: ${message.toString()}`)
        if (this.connected) {
            this.mqtt.publish(topic, message)
        } else {
            console.log("Can't publish; not connected")
        }
    }

    toString() {
        return "GCP cloud messenger"
    }
}

/**
 * Static method to reate appropriate subclass
 */
Messenger.create = function(cloudProvider) {
    switch (cloudProvider) {
    case "AWS":
        return new AwsMessenger()
    case "GCP":
        return new GcpMessenger()
    default:
        throw Error(`cloudProvider ${cloudProvider} unrecognized`)
    }
}

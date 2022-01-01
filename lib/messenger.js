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
    /** Establishes 'defaultDataTopic' as fallback messaging topic to publish data to cloud. */
    constructor() {
        this.defaultDataTopic = 'sensors'
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
 * uses the LTS IoT Core MQTT host at 'ltsapis.goog'.
 */
class GcpMessenger extends Messenger {
    /**
     * Establishes 'gcpParams' so accessible at any time after construction.
     * Also establishes GCP telemetry topic as defaultDataTopic property.
     */
    constructor() {
        super()
        this.gcpParams = {
            projectId: process.env.GCP_PROJECT_ID,
            region: process.env.GCP_REGION,     // per registry
            registryId: process.env.GCP_REGISTRY_ID,
            // prepend 'balena-' because GCP requires deviceId begins with a letter
            deviceId: `balena-${process.env.RESIN_DEVICE_UUID}`
        }
        this.defaultDataTopic = `/devices/${this.gcpParams.deviceId}/events`
    }

    async connect() {
        this.mqttParams = {
          host: 'mqtt.2030.ltsapis.goog',
          port: 8883,
          clientId: `projects/${this.gcpParams.projectId}/locations/${this.gcpParams.region}/registries/${this.gcpParams.registryId}/devices/${this.gcpParams.deviceId}`,
          username: 'unused',
          password: this.createJwt(this.gcpParams.projectId, 'ES256'),
          protocol: 'mqtts',
          secureProtocol: 'TLSv1_2_method',
          ca: [Buffer.from(process.env.GCP_ROOT_CAS, 'base64')]
        }

        this.connected = false
        console.log(`Connecting to host ${this.mqttParams.host}`)
        try {
            this.mqtt = await mqtt.connectAsync(this.mqttParams)
            this.connected = true
            console.log("Connected to IoT Core messaging");
        } catch(e) {
            console.error(e)
        }
    }

    /** Create JWT required for IoT Core renewal. */
    createJwt(projectId, secureAlgorithm) {
        const token = {
          iat: parseInt(Date.now() / 1000),
          exp: parseInt(Date.now() / 1000) + 20 * 60, // 20 minutes
          aud: projectId
        }
        return jwt.sign(token, Buffer.from(process.env.GCP_PRIVATE_KEY, 'base64'),
                        { algorithm: secureAlgorithm})
    }

    isRegistrationComplete() {
        return process.env.GCP_PRIVATE_KEY
                && process.env.GCP_ROOT_CAS
    }

    isUnregistered() {
        return !process.env.GCP_PRIVATE_KEY
                && !process.env.GCP_ROOT_CAS
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

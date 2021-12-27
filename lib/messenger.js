import awsIot from 'aws-iot-device-sdk'

/**
 * Abstract superclass for cloud provider's IoT data messaging.
 *
 * Use Messenger.create() (defined at bottom) to create an instance of the
 * appropriate subclass.
 */
export default class Messenger {
    /**
     * Connects to the cloud providers messenging facility. Must establish
     * this connection before any messaging.
     */
    connect() {
        throw new Error("Abstract method")
    }

    /**
     * Publishes the message to the cloud provider on the provided topic.
     */
    publish(topic, message) {
        throw new Error("Abstract method")
    }
}

class AwsMessenger extends Messenger {
    connect() {
        this.mqtt = awsIot.device({
            privateKey: Buffer.from(process.env.AWS_PRIVATE_KEY, 'base64'),
            clientCert: Buffer.from(process.env.AWS_CERT, 'base64'),
                caCert: Buffer.from(process.env.AWS_ROOT_CA, 'base64'),
              clientId: process.env.RESIN_DEVICE_UUID,
                  host: process.env.AWS_DATA_ENDPOINT,
            })
    }

    publish(topic, message) {
        //console.log(`Messenger pub: ${message.toString()}`)
        this.mqtt.publish(topic, message)
    }
}

/**
 * Static method to reate appropriate subclass
 */
Messenger.create = function() {
    return new AwsMessenger()
}

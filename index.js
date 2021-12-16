import fetch from 'node-fetch'
import mqtt from 'mqtt'
import awsIot from 'aws-iot-device-sdk'
// just for debugging with util.inspect, etc.
//import util from 'util'

let localMqtt = null
let awsMqtt = null

/**
 * Verify that *all* expected environment variables from registration exist.
 */
function isRegistrationComplete() {
    return process.env.AWS_PRIVATE_KEY
            && process.env.AWS_CERT
            && process.env.AWS_ROOT_CA
}

/**
 * Verify that *none* of the expected environment variables from registration exist.
 */
function isUnregistered() {
    return !process.env.AWS_PRIVATE_KEY
            && !process.env.AWS_CERT
            && !process.env.AWS_ROOT_CA
}

/**
 * Provision provided device to cloud. Throws on HTTP error response code.
 */
async function provision(uuid) {
    let url = process.env.PROVISION_URL
    if (!url) {
        throw 'PROVISION_URL environment variable not defined'
    }
    
    const response = await fetch(url, {
        method: 'post',
        body: `{ "uuid": "${uuid}", "attributes": {} }`,
        headers: {'Cache-Control': 'no-cache', 'Content-Type': 'application/json'}
    })
    if (response.ok) {
        // response.status >= 200 && response.status < 300
        console.log(`Provisioned OK: ${response.status}`)
    } else {
        throw `Provisioning failure: ${response.status}, ${response.statusText}`;
    }
}

/** Connects and subscribes to local MQTT topic. */
async function connectLocal() {
    localMqtt = await mqtt.connect('mqtt://127.0.0.1')
    console.log("Connected to mqtt://127.0.0.1")
    await localMqtt.subscribe('sensors', { qos: 1 })
}

/** Connects to cloud provider MQTT. */
function connectCloud() {
    awsMqtt = awsIot.device({
        privateKey: Buffer.from(process.env.AWS_PRIVATE_KEY, 'base64'),
        clientCert: Buffer.from(process.env.AWS_CERT, 'base64'),
            caCert: Buffer.from(process.env.AWS_ROOT_CA, 'base64'),
          clientId: process.env.RESIN_DEVICE_UUID,
              host: process.env.AWS_DATA_ENDPOINT,
        })
}

async function start() {
    //console.log("env: " + JSON.stringify(process.env))
    try {
        if (isUnregistered()) {
            await provision(process.env.RESIN_DEVICE_UUID)
        } else if (isRegistrationComplete()) {
            await connectLocal()
            connectCloud()

            localMqtt.on('message', function (topic, message) {
                //console.log(message.toString())
                awsMqtt.publish('sensors', message)
            })

        } else {
            console.log('Partially registered; try again later')
        }
    } catch(e) {
        console.error(e)
    }
}

start()


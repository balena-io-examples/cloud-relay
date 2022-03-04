import fetch from 'node-fetch'
import mqtt from 'async-mqtt'
import awsIot from 'aws-iot-device-sdk'
import Messenger from './lib/messenger.js'
// just for debugging with util.inspect, etc.
//import util from 'util'

// async wrapper for MQTT client
let localMqtt = null
// messenger with cloud provider (not async)
let cloudMsgr = null

/**
 * Forces the supervisor to update environment variables.
 */
async function updateEnvironmentVars() {
    const updateUrl = `${process.env.BALENA_SUPERVISOR_ADDRESS}/v1/update?apikey=${process.env.BALENA_SUPERVISOR_API_KEY}`
    const updateResp = await fetch(updateUrl, {
        method: 'POST',
        body: '{ "force": true }',
        headers: { 'Content-Type': 'application/json' }
    })
    console.log("Supervisor updated:", updateResp.status)
}

/**
 * Provision provided device to cloud.
 * 
 * @return {boolean} true if provisioning successful; otherwise false.
 */
async function provision(uuid) {
    let url = process.env.PROVISION_URL
    if (!url) {
        throw 'PROVISION_URL environment variable not defined'
    }
    console.log("Provisioning with cloud provider")

    let bodyJson = null
    switch (process.env.CLOUD_PROVIDER) {
        case 'AWS':
        case 'AZURE':
            bodyJson = `{ "uuid": "${uuid}", "method": "POST" }`
            break
        case 'GCP':
            bodyJson = `{ "uuid": "${uuid}" }`
            break
        default:
            throw Error(`cloudProvider ${process.env.CLOUD_PROVIDER} unrecognized`)
    }

    const response = await fetch(url, {
        method: 'POST',
        body: bodyJson,
        headers: {'Cache-Control': 'no-cache', 'Content-Type': 'application/json'}
    })
    const text = await response.text()
    if (response.ok) {
        // response.status >= 200 && response.status < 300
        console.log(`Provisioned OK: ${response.status} ${text}`)
    } else {
        console.warn(`Provisioning failure: ${response.status} ${text}`)

        // If device already provisioned, Supervisor may not have updated environment
        // vars yet and thus tried to provision again. So force Supervisor to update
        // and refresh environment variables. If successful, this service will
        // not attempt to provision on the next invocation.
        let alreadyExists = false
        switch (process.env.CLOUD_PROVIDER) {
            case 'AWS':
                alreadyExists = (text == "thing already exists")
                break
            case 'AZURE':
                alreadyExists = text.startsWith("DeviceAlreadyExistsError")
                break
            case 'GCP':
                let respJson = {}
                try {
                    respJson = JSON.parse(text)
                } catch(e) {
                    // just use empty respJson
                }
                const alreadyExistsCode = 6

                alreadyExists = (respJson.code && respJson.code == alreadyExistsCode)
                break
            default:
                // not possible at this point
                break
        }
        if (alreadyExists) {
            console.warn(`Device already exists on ${process.env.CLOUD_PROVIDER}; updating environment vars`)
            updateEnvironmentVars()
        }
    }
    return response.ok
}

/**
 * Connects and subscribes to local MQTT topic. Retries twice if can't connect.
 *
 * If success, 'localMqtt' is not null.
 */
async function connectLocal() {
    if (!process.env.PRODUCER_TOPIC) {
        process.env.PRODUCER_TOPIC = 'sensors'
    }

    let count = 0
    const maxTries = 3
    const delay = 5
    do { 
        try {
            count++
            if (!localMqtt) {
                localMqtt = await mqtt.connectAsync('mqtt://127.0.0.1')
                console.log("Connected to mqtt://127.0.0.1")
            }
            await localMqtt.subscribe(process.env.PRODUCER_TOPIC, { qos: 1 })
            console.log("Subscribed to topic:", process.env.PRODUCER_TOPIC)
            break
        } catch(e) {
            console.warn("Cannot connect to local MQTT:", e)
            if (count < maxTries) {
                console.log(`Retry in ${delay} seconds`)
                await new Promise(r => setTimeout(r, delay * 1000))
            } else {
                console.warn(`Retries exhausted`)
                localMqtt = null  // indicates connection failed
            }
        }
    } while(count < maxTries)
}

/**
 * Runs the relay. Wraps all execution in a try/catch block.
 * 
 * Initializes CLOUD_PROVIDER variable to identify the provider based on the
 * presence of provider specific variables above. You may explicitly define
 * an environment variable with this name for development purposes.
 */
async function start() {
    //console.log("env: " + JSON.stringify(process.env))
    if (!process.env.CLOUD_PROVIDER) {
        if (process.env.AWS_DATA_ENDPOINT) {
            process.env.CLOUD_PROVIDER = 'AWS'
        } else if (process.env.AZURE_HUB_HOST) {
            process.env.CLOUD_PROVIDER = 'AZURE'
        } else if (process.env.GCP_PROJECT_ID) {
            process.env.CLOUD_PROVIDER = 'GCP'
        } else {
            console.error("Can't determine cloud provider")
            return
        }
    }
    let cloudMsgr = Messenger.create(process.env.CLOUD_PROVIDER)
    console.log(`Created cloud messenger: ${cloudMsgr}`)
    
    try {
        if (cloudMsgr.isUnregistered()) {
            await provision(process.env.RESIN_DEVICE_UUID)

        } else if (cloudMsgr.isRegistrationComplete()) {
            await connectLocal()
            if (localMqtt) {
                if (!process.env.CLOUD_CONSUMER_TOPIC) {
                    process.env.CLOUD_CONSUMER_TOPIC = cloudMsgr.defaultConsumerTopic
                }
                const finalTopic = cloudMsgr.finalizeConsumerTopic(process.env.CLOUD_CONSUMER_TOPIC)
                if (cloudMsgr.isSyncConnect()) {
                    cloudMsgr.connectSync()
                } else {
                    await cloudMsgr.connect()
                }

                localMqtt.on('message', function (topic, message) {
                    cloudMsgr.publish(finalTopic, message)
                })
            }

        } else {
            console.log('Partially registered; try again later')
        }
    } catch(e) {
        console.error(e)
    }
}

start()


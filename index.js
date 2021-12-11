import fetch from 'node-fetch'

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

async function start() {
    try {
        if (isUnregistered()) {
            await provision(process.env.RESIN_DEVICE_UUID)
        } else if (isRegistrationComplete()) {
            //await connect()
        } else {
            console.log('Partially registered; try again later')
        }
    } catch(e) {
        console.error(e)
    }
}

start()


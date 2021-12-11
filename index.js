
/**
 * Verify that expected environment variables from registration exist.
 */
function isRegistered() {
    if (process.env.AWS_PRIVATE_KEY
            && process.env.AWS_CERT
            && process.env.AWS_ROOT_CA) {
        console.log('Cloud environment variables found.')
        return true
    }
    console.log('Cloud environment variables not found.')
    return false
}

async function register() {
}

async function start() {
    if (!isRegistered()) {
        await register()
    } else {
        //await connect()
    }
}

start()


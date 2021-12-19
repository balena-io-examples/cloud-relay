# Cloud Relay Block

*Easily send data to an IoT Cloud provider*

![Overview](overview.png)

The cloud relay accepts application data via MQTT and relays it to a cloud provider's IoT Core facility. You only need to provide the data, and the cloud relay takes care of messaging with the cloud provider. Cloud relay also uses the [balena-aws-lambda](https://github.com/balena-io-examples/balena-aws-lambda) utility to securely automate device provisioning to AWS IoT Core.

## Getting Started

Use the docker-compose [example script](docker-compose.yml), which provides WiFi metrics data for the cloud relay. We assume you have a running balena-aws-lambda function to handle device provisioning with AWS.

First create a multi-container fleet in balenaCloud and provision a device with balenaOS. See the [online docs](https://www.balena.io/docs/learn/getting-started/raspberrypi3/nodejs/) for details.

Next define the fleet variables from the AWS cloud setup, AWS_DATA_ENDPOINT and PROVISION_URL, as described in the *Configuration* section below.

Finally push the docker-compose script to the balena builders, substituting your fleet's name for `<myFleet>` in the commands below.

```
    git clone https://github.com/balena-io-examples/cloud-relay.git
    balena push <myFleet>
```

After the automated cloud provisioning, you should see data flowing through the cloud relay to AWS, like the log output below.

```
sensor  publishing sample: {} {'short_uuid': 'ab24d4b', 'quality_value': '70', 'quality_max': '70', 'signal_level': '-39'}
sensor  publishing sample: {} {'short_uuid': 'ab24d4b', 'quality_value': '70', 'quality_max': '70', 'signal_level': '-39'}
```

## Configuration

**Required** balena fleet variables

|  Name            | Value                                                                         | Notes                                                                            |
|------------------|-------------------------------------------------------------------------------|----------------------------------------------------------------------------------|
| AWS_DATA_ENDPOINT| like `xxxxxxxx-ats.iot.us-east-1.amazonaws.com                               ` | Host name to receive data. See *Settings* in the AWS IoT console.                |
|  PROVISION_URL   | like `https://xxxxxxxx.execute-api.us-east-1.amazonaws.com/resinLambda-development` | URL to contact the AWS Lambda provisioning function created by balena-aws-lambda.|

**Optional** balena fleet or device variables, if not using default value

|  Name            | Value                                                                         | Notes                                                                            |
|------------------|-------------------------------------------------------------------------------|----------------------------------------------------------------------------------|
| PRODUCER_TOPIC| default `sensors` | Message topic from data producer |
| CLOUD_DATA_TOPIC| default `sensors` | Message topic for data to cloud |


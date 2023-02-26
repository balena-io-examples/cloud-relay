# Cloud Relay Block

*Easily send data to an IoT Cloud provider*

![Overview](doc/overview.png)

Cloud Relay accepts application data via MQTT and relays it to a cloud provider's IoT Core facility. You only need to provide the data, and Cloud Relay takes care of messaging with the cloud provider. Cloud Relay works with AWS, Azure, and Google Cloud (GCP).

**Note:** Google has issued a [deprecation notice](https://cloud.google.com/iot/docs/release-notes#August_16_2022) for the Cloud IoT service due to shutdown in August 2023. Cloud Relay's support for GCP IoT Core will not receive further updates. [ClearBlade](https://www.clearblade.com/iot-core/) provides a replacement IoT Core product that integrates with GCP Pub/Sub in a similar way. The only differences for Cloud Relay are use of a ClearBlade-specific provisioning tool and network messaging host. Cloud Relay now supports ClearBlade on an experimental basis.

## Getting Started

You first must set up the cloud provider's IoT service. Balena also provides cloud functions for AWS, Azure and GCP that expose an HTTP endpoint to initially provision each device. See the _Cloud Provisioning_ section below.

### Device

We will create a fleet to push system metrics data to the cloud provider and add a device to it. Simply click on the *Deploy with balena* button below to create a fleet from this [docker-compose](https://github.com/balena-io-examples/cloud-relay-starter/blob/master/docker-compose.yml) file.

[![balena deploy button](https://www.balena.io/deploy.svg)](https://dashboard.balena-cloud.com/deploy?repoUrl=https://github.com/balena-io-examples/network-metrics-logger)

Next define fleet variables as described in the *Configuration* section below. Finally, add a device to the fleet as prompted from the dashboard.

Cloud Relay first will attempt to provision the device with the cloud provider, using `PROVISION_URL`. Once that completes, you should see data flowing from the system-metrics container through the cloud relay to the provider's MQTT broker, like the log output below.

```
Published msg: {'short_uuid': 04166f8, "currentLoad":0.8995528642244212,"cpuTemperature":32.9,"mem":4762161152}
Published msg: {'short_uuid': 04166f8, "currentLoad":0.5756115873115185,"cpuTemperature":32.9,"mem":4762664960}
```

**ClearBlade/GCP Note** Cloud Relay publishes only to the telemetry (events) topic. It does not publish to the state topic or subscribe to the configuration or commands topics.

### Cloud Provisioning

Cloud Relay triggers secure provisioning of a balena device to the provider's registry before publishing data. This provisioning generates public key credentials as environment variables, which are stored on balenaCloud and passed on to the device. Cloud Relay then uses the credentials to communicate with the provider's IoT Core.

![Provision-Send](doc/provision-send.png)

We have developed projects that automate this provisioning, including use of the provider's "cloud function" capability to trigger the provisioning code via HTTP request. See the linked projects in the table below and the environment variables in the *Configuration* section below.

| Provider / Cloud Function | GitHub project |
|----------|-------------------|
| AWS Lambda | [aws-iot-provision](https://github.com/balena-io-examples/aws-iot-provision) |
| Azure Functions | [azure-iot-provision](https://github.com/balena-io-examples/azure-iot-provision) |
| GCP Cloud Functions for ClearBlade | [cb-gcp-iot-provision](https://github.com/balena-io-examples/cb-gcp-iot-provision) |
| GCP Cloud Functions for Google IoT Core (deprecated) | [gcp-iot-provision](https://github.com/balena-io-examples/gcp-iot-provision) |

## Configuration

Environment variables, probably common to all devices so may be defined as balena **Fleet** variables. This section is organized by cloud provider. In all cases Cloud Relay must know the message topic used by the data producer.

|  Name | Value | Notes |
|-------|-------|-------|
| PRODUCER_TOPIC| default `sensors` | Message topic from data producer. `sensors` is used by the [Sensor](https://github.com/balenablocks/sensor) block. |
| CLOUD_PROVIDER | AWS, AZURE, or GCP | *Optional*, by default Cloud Relay can determine the provider based on  other environment variables as described below. However, explicitly defining the cloud provider is useful for a custom provisioning method.<br>Use GCP for ClearBlade as well, and see the *ClearBlade/GCP* section below. |


### AWS

|  Name | Value | Notes |
|-------|-------|-------|
|  PROVISION_URL   | like<br>`https://xxxxxxxx.execute-api.<region>.amazonaws.com/default/provision` | URL to trigger the provisioning cloud function. See *Functions -> provision -> Configuration -> Triggers* in the AWS Lambda console. |
| AWS_DATA_ENDPOINT| like<br>`xxxxxxxx-ats.iot.<region>.amazonaws.com                               ` | Host name to receive data. See *Settings* in the AWS IoT console. |
| CLOUD_CONSUMER_TOPIC| default `sensors` | Topic for message sent to AWS. |

AWS_CERT and AWS_PRIVATE_KEY variables for each device are [generated](https://github.com/balena-io-examples/aws-iot-provision#device-environment-variables) by the provisioning tool.

### Azure

|  Name | Value | Notes |
|-------|-------|-------|
|  PROVISION_URL   | like<br>`https://xxxx.azurewebsites.net/api/provision` | URL to trigger the provisioning cloud function.|
| AZURE_HUB_HOST | like<br>`<iot-hub-name>.azure-devices.net` | Host name to receive data. See *Overview* for the IoT Hub in the Azure portal. |
| CLOUD_CONSUMER_TOPIC| default `sensors`| Cloud Relay creates a `topic` key with this value in the `properties` map included in the message to Azure. |

AZURE_CERT and AZURE_PRIVATE_KEY variables for each device are [generated](https://github.com/balena-io-examples/azure-iot-provision#device-environment-variables) by the provisioning tool.

### ClearBlade / GCP

|  Name | Value | Notes |
|-------|-------|-------|
|  PROVISION_URL   | like<br>`https://<region>-<projectID>.cloudfunctions.net/provision` | URL to trigger the provisioning cloud function. |
| MESSAGING_HOST | default `mqtt.googleapis.com` | Hostname to receive data. The default is for Google IoT Core. See ClearBlade [docs](https://clearblade.atlassian.net/wiki/spaces/IC/pages/2210299905/Retargeting+Devices) for their IoT Core hosts. |
| CLOUD_CONSUMER_TOPIC| default `events` | Topic for message sent to GCP, which expects `events` as the default *telemetry* topic. As the docs [describe](https://cloud.google.com/iot/docs/how-tos/mqtt-bridge#publishing_telemetry_events_to_additional_cloud_pubsub_topics), you also may publish to a subfolder like `events/alerts`. |

GCP_CLIENT_PATH, GCP_DATA_TOPIC_ROOT, GCP_PRIVATE_KEY, and GCP_PROJECT_ID variables for each device are [generated](https://github.com/balena-io-examples/gcp-iot-provision#device-environment-variables) by the provisioning tool. The ClearBlade provisioning tool uses these same variable names.

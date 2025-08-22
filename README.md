# Java Spring Cloud Stream Generator Template

This template generates a Spring Cloud Stream (SCSt) microservice. It uses version 3 of SCSt which uses function names to configure the channels. See the [reference](https://cloud.spring.io/spring-cloud-static/spring-cloud-stream/3.0.1.RELEASE/reference/html/spring-cloud-stream.html). The generated microservice is a Maven project so it can easily be imported into your IDE. 

This template has been tested with Kafka, RabbitMQ and Solace.

The Spring Cloud Stream microservice generated using this template will be an _ready to run_ Spring Boot app. By default, the microservice will contain a java class, _Application.java_, which includes methods to publish or subscribe events as defined in the AsyncAPI document. These generated methods include Supplier, Consumer and Function functional interfaces from the [java.util.function](https://docs.oracle.com/javase/8/docs/api/java/util/function/package-summary.html) package. These methods will already be pre-configured to publish to and consume from the channels as defined in the AsyncAPI. This configuration is located in the `spring.cloud.stream` section of the generated application.yml file.

Note that this template ignores the 'Servers' section of AsyncAPI documents. The main reason for this is because SCSt does not directly work with messaging protocols. Protocols are implementation details specific to binders, and SCSt applications need not know or care which protocol is being used.

## Technical requirements

- >=2.0.0 <=3.3.0 [Generator](https://github.com/asyncapi/generator/)
- Generator specific [requirements](https://github.com/asyncapi/generator/#requirements)
- Java 17 or higher (required for Spring Boot 3.4.4+)
- Maven 3.6+ (for building generated projects)

## Version Compatibility

This template has been tested and verified with the following version combinations:

### Recommended Version Matrix
| Component | Version | Notes |
|-----------|---------|-------|
| Spring Boot | 3.4.4+ | Required for Spring Cloud 2024.0.0 compatibility |
| Spring Cloud | 2024.0.0 | Latest stable release |
| Spring Cloud Stream | 3.1.3 | Compatible with Spring Cloud 2024.0.0 |
| Kafka Binder | 4.2.0 | Must match Spring Cloud Stream version |
| RabbitMQ Binder | 4.2.0 | Must match Spring Cloud Stream version |
| Solace Binder | 4.8.0 | Compatible with Spring Cloud 2024.0.0 |

### Important Compatibility Notes
- **Spring Boot 2.x is not supported** with Spring Cloud 2024.0.0
- **Spring Boot 3.1.0** may cause compatibility issues with Spring Cloud Stream 4.2.0
- All binder versions should match the Spring Cloud Stream version for optimal compatibility
- Use Spring Boot 3.4.4 or later to avoid `NoSuchMethodError` issues

## Specification Conformance
Note that this template interprets the AsyncAPI document in conformance with the [AsyncAPI Specification](https://www.asyncapi.com/docs/specifications/2.0.0/).
This means that when the template sees a subscribe operation, it will generate code to publish to that operation's channel.
It is possible to override this, see the 'view' parameter in the parameters section below.

### Which Methods are created
The template works as follows:
* By default, for each channel in the AsyncAPI document, if there is a _subscribe_ operation a _Supplier_ method will be generated, and for a _publish_ operation a _Consumer_ method will get generated.
* To customize this default behavior, you can make use of the `x-scs-function-name` extension. If one _publish_ operation and one _subscribe_ operation share a `x-scs-function-name` attribute then a _java.util.function.Function_ method will be created which uses the _subscribe_ operation's message as the input and the _publish_ operation's message as the output to the generated Function method. It will also wire up the proper channel information in the generated application.yaml file.
* Note that at this time the generator does not support the creation of functions that have more than one _publish_ and/or more than one _subscribe_ operation with the same ```x-scs-function-name``` attribute. This scenario will result in error.
* Additionally, if a channel has parameters and a _subscribe_ operation, a _send method_ will be generated that takes the payload and the parameters as function arguments, formats the topic from the parameters, and sends the message using the StreamBridge as described in the [Spring Cloud Steam](https://docs.spring.io/spring-cloud-stream/docs/3.1.3/reference/html/spring-cloud-stream.html#_streambridge_and_dynamic_destinations) documentation. If you use `x-scs-function-name` to combine a _subscribe_ and a _publish_ operation and the _subscribe_ operation has parameters, then this template will render a _Consumer_ method that will receive a message and then call the generated _send method_ to send out a new message through the StreamBridge.

  This behaviour may be modified by setting the _dynamicType_ parameter to 'header'. This is to support binders that can route messages by putting the topic into a message header. In this case, a _Supplier_ and a _Function_ will set the header on the message rather than use the StreamBridge, however _send methods_ will still be rendered for convenience.


### Method Naming
The generated methods are named as follows: 
* For each operation (i.e., _publish_ or _subscribe_ in each channel), the template looks for the specification extension ```x-scs-function-name```. If present, it uses that to name the function. 
* If using the same ```x-scs-function-name``` on one _publish_ operation and one _subscribe_ operation to create a Function the name of the generated method will be the ```x-scs-function-name```
* If there is no ```x-scs-function-name``` attribute, the generator checks the operation's operationId value. If set, that is used as the function name. 
* If there is no ```x-scs-function-name``` or operationId available, then a name will be generated by taking the channel name, removing non-alphanumeric characters, converting to camel case, and appending 'Supplier' or 'Producer.' For example, if there is a channel called store/process with a publisher operation with a payload called Order, the following method will get generated:
 ```
@Bean
public Supplier<Order> storeProcessSupplier () {
  // Add business logic here.
  return null;
}
```
### Property Naming

When converting from property names to Java field names, the property names are first converted to camelCase, removing non-alphanumeric characters in the process. If the resulting name ends up being a Java keyword, it is prepended with an underscore.

### Application vs Library

By default, this will generate a runnable Spring Boot application. If you set the ```artifactType``` parameter to ```library```, then it will generate a project without a main Application class and without the main Spring Boot dependencies. That will produce a library that can be imported into another application as a Maven artifact. It will contain the model classes and the Spring Cloud Stream configuration.

Doing that allows you to have a clean separation between the generated code and your hand-written code, and ensures that regenerating the library will not overwrite your business logic.

## How to Use This Template

1. Install the AsyncAPI Generator
  ```
  npm install -g @asyncapi/generator
  ```

2. Run the Generator using the Java Spring Cloud Stream Template
  ```
  npx @asyncapi/generator ~/AsyncApiDocument.yaml @asyncapi/java-spring-cloud-stream-template
  ```

3. Run the Generator using the Java Spring Cloud Stream Template with Parameters
  ```
  npx @asyncapi/generator -p binder=solace -p artifactId=ExampleArtifactId -p groupId=com.example -p javaPackage=com.example.foo -p springBootVersion=3.4.4 -p springCloudVersion=2024.0.0 -p solaceSpringCloudVersion=4.8.0 ~/AsyncApiDocument.yaml @asyncapi/java-spring-cloud-stream-template
  ```

**Note:** The `ag` command is deprecated. Use `npx @asyncapi/generator` instead for better compatibility with current generator versions.

### CLI Compatibility Note

The AsyncAPI CLI (`asyncapi` command) may use an older bundled generator version that's incompatible with this template. If you encounter version compatibility errors, use `npx @asyncapi/generator` instead:

```bash
# ❌ May fail due to version incompatibility
asyncapi generate fromTemplate document.yaml @asyncapi/java-spring-cloud-stream-template

# ✅ Recommended approach
npx @asyncapi/generator document.yaml @asyncapi/java-spring-cloud-stream-template
```

## Configuration Options

Please note that none of the parameters or specification extensions is required. All parameters have defaults as documented below.

Any parameters or specification extensions that include the name 'Solace' only have an effect when the Solace binder is specified. If and when other binder-specific parameters are added to this template, they will follow a similar naming pattern.

### Destination Overrides

There are two specification extensions you can use to shape how the bindings are configured. You can add the following to a _subscribe_ operation:

```x-scs-destination``` : This overrides the destination value in a binder. This is useful when you are using the Solace binder and you are following the Solace pattern of publishing to topics and consuming from queues. In this case the x-scs-destination value would be treated as the name of the queue which your microservice will consume from.

```x-scs-group``` : This will add the group value on a binding which configures your microservice to use [Consumer Groups](https://cloud.spring.io/spring-cloud-static/spring-cloud-stream/current/reference/html/spring-cloud-stream.html#consumer-groups)

### Limitations
Currently any schemas that are used must be in the components/schemas part of the document. We do not support anonymous object-type schemas in the message/payload sections.

### Parameters

Parameters can be passed to the generator using command line arguments in the form ```-p param=value -p param2=value2```. Here is a list of the parameters that can be used with this template. In some cases these can be put into the AsyncAPI documents using the specification extensions feature. In those cases, the 'info' prefix means that it belongs in the info section of the document.

Parameter | Extension | Default | Description
----------|-----------|---------|---
actuator    |              | false | If true, it adds the dependencies for spring-boot-starter-web, spring-boot-starter-actuator and micrometer-registry-prometheus.
artifactId  |  info.x-artifact-id | project-name | The Maven artifact id. Alternatively you can set the specification extension info.x-artifact-id.
artifactType | | application | The type of project to generate, application or library. When generating an application, the pom.xml file will contain the complete set of dependencies required to run an app, and it will contain an Application class with a main function. Otherwise the pom file will include only the dependencies required to compile a library.
binder | | kafka | The name of the binder implementation, one of kafka, rabbit or solace. Default: kafka. If you need other binders to be supported, please let us know!
dynamicType | | streamBridge | If you publish to a channel with parameters, i.e. a topic that can change with every message, the standard way to do this is to use StreamBridge. But some binders such as Solace can do the dynamic routing using just a message header. If you use such a binder, then you can set this value to 'header' and the generated code will set the topic on the header rather than use StreamBridge.
groupId | info.x-group-id | com.company | The Maven group id. Alternatively you can set the specification extension info.x-group-id.
host | | tcp://localhost:55554 | The host connection property. Currently this only works with the Solace binder. When other binders are used this parameter is ignored.
javaPackage | info.x-java-package | | The Java package of the generated classes. If not set then the classes will be in the default package. Alternatively you can set the specification extension info.x-java-package.
msgVpn | | default | The message vpn connection property. Currently this only works with the Solace binder. When other binders are used this parameter is ignored.
password | | default | The client password connection property. Currently this only works with the Solace binder. When other binders are used this parameter is ignored.
parametersToHeaders | | false | If true, this will create headers on the incoming messages for each channel parameter. Currently this only works with messages originating from Solace (using the solace_destination header) and RabbitMQ (using the amqp_receivedRoutingKey header.)
reactive | | false | If true, the generated functions will use the Reactive style and use the Flux class.
kafkaSpringCloudVersion | info.x-kafka-spring-cloud-version | 4.2.0 | The version of the spring-cloud-stream-binder-kafka dependency used when generating an application with Kafka binder. Alternatively you can set the specification extension info.x-kafka-spring-cloud-version.
rabbitSpringCloudVersion | info.x-rabbit-spring-cloud-version | 4.2.0 | The version of the spring-cloud-stream-binder-rabbit dependency used when generating an application with RabbitMQ binder. Alternatively you can set the specification extension info.x-rabbit-spring-cloud-version.
solaceSpringCloudVersion | info.x-solace-spring-cloud-version | 4.8.0 | The version of the solace-spring-cloud-bom dependency used when generating an application. Alternatively you can set the specification extension info.x-solace-spring-cloud-version.
springBootVersion | info.x-spring-boot-version | 3.4.4 | The version of Spring Boot used when generating an application. Alternatively you can set the specification extension info.x-spring-boot-version. 
springCloudVersion | info.x-spring-cloud-version | 2024.0.0 | The version of the spring-cloud-dependencies BOM dependency used when generating an application. Alternatively you can set the specification extension info.x-spring-cloud-version.
springCloudStreamVersion | info.x-spring-cloud-stream-version | 3.1.3 | The version of the spring-cloud-stream dependency specified in the Maven file, when generating a library. When generating an application, the spring-cloud-dependencies BOM is used instead. Alternatively you can set the specification extension info.x-spring-cloud-stream-version.
username | | default | The client username connection property. Currently this only works with the Solace binder. When other binders are used this parameter is ignored.
view | info.x-view | client | By default, this template generates publisher code for subscribe operations and vice versa. You can switch this by setting this parameter to 'provider'. Alternatively you can set the specification extension info.x-view.
useServers | | false | This parameter only works when the binder parameter is kafka. It takes all the urls under the server section and concatenates them to a set of brokers. Default: false.
kafkaBrokers | | localhost:9092 | Comma-separated list of Kafka broker addresses. Example: localhost:9092,localhost:9093.
rabbitHost | | localhost | RabbitMQ host address.
rabbitPort | | 5672 | RabbitMQ port number.
rabbitUsername | | guest | RabbitMQ username.
rabbitPassword | | guest | RabbitMQ password.

## Specification Extensions

The following specification extensions are supported. In some cases, their value can be provided as a command line parameter. The 'info' prefix means that it belongs in the info section of the document.

Extension | Parameter | Default | Description
----------|-----------|---------|-------------
info.x-artifact-id | artifactId | project-name | The Maven artifact id.
info.x-group-id | groupId | com.company | The Maven group id.
info.x-java-package | javaPackage | | The Java package of the generated classes. If not set then the classes will be in the default package.
info.x-kafka-spring-cloud-version | kafkaSpringCloudVersion | 4.2.0 | The version of the spring-cloud-stream-binder-kafka dependency used when generating an application with Kafka binder.
info.x-rabbit-spring-cloud-version | rabbitSpringCloudVersion | 4.2.0 | The version of the spring-cloud-stream-binder-rabbit dependency used when generating an application with RabbitMQ binder.
info.x-solace-spring-cloud-version | solaceSpringCloudVersion | 4.8.0 | The version of the solace-spring-cloud BOM dependency used when generating an application.
info.x-spring-boot-version | info.x-spring-boot-version | 3.4.4 | The version of the Spring Boot used when generating an application.
info.x-spring-cloud-version | springCloudVersion | 2024.0.0 | The version of the spring-cloud-dependencies BOM dependency used when generating an application.
info.x-spring-cloud-stream-version | springCloudStreamVersion | 3.1.3 | The version of the spring-cloud-stream dependency specified in the Maven file, when generating a library. When generating an application, the spring-cloud-dependencies BOM is used instead.
info.x-view | view | client | By default, this template generates publisher code for subscribe operations and vice versa. You can switch this by setting this parameter to 'provider'.
operation.x-scs-function-name | | | This specifies the base function name to use on a publish or subscribe operation. If the same name is used on one subscribe operation and one publish operation, a processor function will be generated.
channel.subscription.x-scs-destination | | | This overrides the destination on an incoming binding. It can be used to specify, for example, the name of a queue to subscribe to instead of a topic.
channel.subscription.x-scs-group | | | This is used to specify the group property of an incoming binding.

## Troubleshooting

### Common Issues

#### NoSuchMethodError with Spring Integration
If you encounter errors like:
```
java.lang.NoSuchMethodError: org/springframework/integration/support/MessageBuilder.removeHeader
```

**Solution:** Ensure you're using Spring Boot 3.4.4 or later. This error occurs when using older Spring Boot versions (like 3.1.0) with Spring Cloud 2024.0.0.

#### Version Compatibility Issues
If you experience dependency conflicts or runtime errors:

1. **Check Spring Boot Version:** Ensure you're using Spring Boot 3.4.4+
2. **Verify Binder Versions:** Kafka and RabbitMQ binders should use version 4.2.0
3. **Update AsyncAPI Extensions:** Remove any `x-spring-boot-version` extensions that specify versions below 3.4.4

#### Generator Version Compatibility Issues
If you encounter errors like:
```
Error: This template is not compatible with the current version of the generator (1.17.25). 
This template is compatible with the following version range: >=2.0.0 <=3.3.0.
```

**Solution:** Use `npx @asyncapi/generator` instead of `asyncapi generate` or `ag` commands. The CLI may use an older bundled generator version that's incompatible with this template.

#### Binder-Specific Issues
- **Kafka:** Ensure `kafkaSpringCloudVersion` is set to 4.2.0
- **RabbitMQ:** Ensure `rabbitSpringCloudVersion` is set to 4.2.0
- **Solace:** Ensure `solaceSpringCloudVersion` is set to 4.8.0

## Development

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind are welcome!

If you do contribute, please run ```npm run lint``` and ```npm test``` before you submit your code.


## Contributors

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):
<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tr>
    <td align="center"><a href="https://github.com/gvensan"><img src="https://avatars.githubusercontent.com/u/4477169?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Giri Venkatesan</b></sub></a><br /><a href="https://github.com/asyncapi/java-spring-cloud-stream-template/commits?author=gvensan" title="Code">💻</a></td> 
    <td align="center"><a href="http://www.damaru.com"><img src="https://avatars1.githubusercontent.com/u/3926925?v=4?s=100" width="105px;" alt=""/><br /><sub><b>Michael Davis</b></sub></a><br /><a href="https://github.com/asyncapi/java-spring-cloud-stream-template/commits?author=damaru-inc" title="Code">💻</a> <a href="https://github.com/asyncapi/java-spring-cloud-stream-template/commits?author=damaru-inc" title="Documentation">📖</a> <a href="https://github.com/asyncapi/java-spring-cloud-stream-template/pulls?q=is%3Apr+reviewed-by%3Adamaru-inc" title="Reviewed Pull Requests">👀</a> <a href="#question-damaru-inc" title="Answering Questions">💬</a></td>
    <td align="center"><a href="https://marcd.dev"><img src="https://avatars0.githubusercontent.com/u/1815312?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Marc DiPasquale</b></sub></a><br /><a href="https://github.com/asyncapi/java-spring-cloud-stream-template/commits?author=Mrc0113" title="Documentation">📖</a></td>
    <td align="center"><a href="http://www.fmvilas.com"><img src="https://avatars3.githubusercontent.com/u/242119?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Fran Méndez</b></sub></a><br /><a href="https://github.com/asyncapi/java-spring-cloud-stream-template/commits?author=fmvilas" title="Code">💻</a> <a href="#infra-fmvilas" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a></td>
    <td align="center"><a href="https://resume.github.io/?derberg"><img src="https://avatars1.githubusercontent.com/u/6995927?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Lukasz Gornicki</b></sub></a><br /><a href="#infra-derberg" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="https://github.com/asyncapi/java-spring-cloud-stream-template/commits?author=derberg" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/blzsaa"><img src="https://avatars.githubusercontent.com/u/17824588?v=4?s=100" width="100px;" alt=""/><br /><sub><b>blzsaa</b></sub></a><br /><a href="https://github.com/asyncapi/java-spring-cloud-stream-template/commits?author=blzsaa" title="Code">💻</a></td>
  </tr>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->


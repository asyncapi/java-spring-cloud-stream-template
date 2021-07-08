{%- include 'partials/java-package' -%}
{%- set extraIncludes = [asyncapi, params] | appExtraIncludes %}
{%- set dynamicFuncs = [asyncapi, params] | getDynamicFunctions -%}

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
{% if extraIncludes.needMessageInclude %}
import org.springframework.messaging.Message;
{% endif %}
{%- if params.reactive === 'true' %}
import reactor.core.publisher.Flux;
{%- endif -%}
{%- set funcs = [asyncapi, params] | functionSpecs -%}
{%- set hasFunctions = false -%}
{%- set hasConsumers = false -%}
{%- set hasSuppliers = false -%}
{%- for funcName, funcSpec in funcs -%}
{%- if funcSpec.type === 'function' -%}
{%- set hasFunctions = true %}
{%- endif %}
{%- if funcSpec.type === 'consumer' -%}
{%- set hasConsumers = true %}
{%- endif %}
{%- if funcSpec.type === 'supplier' -%}
{%- set hasSuppliers = true -%}
{%- endif -%}
{%- endfor %}
{%- if hasFunctions %}
import java.util.function.Function;
{%- endif %}
{%- if hasConsumers %}
import java.util.function.Consumer;
{%- endif %}
{%- if hasSuppliers %}
import java.util.function.Supplier;
{%- endif %}
{% if extraIncludes.dynamicTopics %}
// Uncomment this if you want to use one of the sample functions commented out below.
/*
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cloud.stream.binder.BinderHeaders;
import org.springframework.cloud.stream.function.StreamBridge;
{%- if extraIncludes.dynamicTopics and not extraIncludes.needMessageInclude %}
import org.springframework.messaging.Message;
{%- endif %}
import org.springframework.messaging.support.MessageBuilder;
*/
{% endif %}

{% set className = [asyncapi.info(), params] | mainClassName %}
@SpringBootApplication
public class {{ className }} {

    private static final Logger logger = LoggerFactory.getLogger({{ className }}.class);
{%- if dynamicFuncs.size %}
//Uncomment this if you want to use one of the sample functions commented out below.
/*
    private static final String DYNAMIC_BINDING = "dynamic";
    @Autowired
    private StreamBridge streamBridge;
*/
{%- endif %}

	public static void main(String[] args) {
		SpringApplication.run({{ className }}.class);
	}
{% for funcName, funcSpec in funcs %}
	@Bean
	{{ funcSpec.functionSignature | safe }} {
		{%- if funcSpec.isSubscriber and funcSpec.type !== 'function' %}
		return data -> {
			// Add business logic here.	
			logger.info(data.toString());
		};
		{%- else %}
		return data -> {
			// Add business logic here.
			return new {{ funcSpec.publishPayload | safe }}();
		};
		{%- endif %}
	}
{% endfor %}

{% if dynamicFuncs.size %}
/* Here is an example of how to send a message to a dynamic topic:
{% for dynFuncName, dynFuncSpec in dynamicFuncs %}
	public void {{ dynFuncName }}(
		{{ dynFuncSpec.payloadClass }} payload, {{ dynFuncSpec.topicInfo.functionParamList }}
		) {
		String topic = String.format("{{ dynFuncSpec.topicInfo.publishTopic }}",
			{{ dynFuncSpec.topicInfo.functionArgList }});
		Message message = MessageBuilder
			.withPayload(payload)
			.setHeader(BinderHeaders.TARGET_DESTINATION, topic)
			.build();
		streamBridge.send(DYNAMIC_BINDING, message);
	}
{%- endfor %}
*/
{%- endif %}
}

{%- include 'partials/java-package' -%}
{%- set extraIncludes = [asyncapi, params] | appExtraIncludes %}
{%- set dynamicFuncs = [asyncapi, params] | getDynamicFunctions -%}

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
{% if extraIncludes.dynamicTopics %}
import org.springframework.beans.factory.annotation.Autowired;
{% endif %}
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
{% if extraIncludes.dynamicTopics %}
import org.springframework.cloud.stream.binder.BinderHeaders;
import org.springframework.cloud.stream.function.StreamBridge;
{% endif %}
import org.springframework.context.annotation.Bean;
{% if extraIncludes.dynamicTopics or extraIncludes.needMessageInclude %}
import org.springframework.messaging.Message;
{% endif %}
{% if extraIncludes.dynamicTopics %}
import org.springframework.messaging.support.MessageBuilder;
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

{% set className = [asyncapi.info(), params] | mainClassName %}
@SpringBootApplication
public class {{ className }} {
{%- if dynamicFuncs.size %}
	private static final String DYNAMIC_BINDING = "dynamic";
{%- endif %}
	private static final Logger logger = LoggerFactory.getLogger({{ className }}.class);
{%- if dynamicFuncs.size %}
	@Autowired
	private StreamBridge streamBridge;
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

{%- for dynFuncName, dynFuncSpec in dynamicFuncs %}
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

}

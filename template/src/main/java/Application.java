{%- include 'partials/java-package' -%}
{%- set extraIncludes = [asyncapi, params] | appExtraIncludes %}
{%- set funcs = [asyncapi, params] | functionSpecs %}
{%- set imports = [asyncapi, params] | extraImports %}

{%- if extraIncludes.needFunction %}
import java.util.function.Function;
{%- endif -%}
{%- if extraIncludes.needConsumer %}
import java.util.function.Consumer;
{%- endif -%}
{%- if extraIncludes.needSupplier %}
import java.util.function.Supplier;
{%- endif %}

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
{%- if extraIncludes.dynamic and params.dynamicType === 'streamBridge' %}
import org.springframework.beans.factory.annotation.Autowired;
{%- endif %}
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
{%- if extraIncludes.dynamic %}
	{%- if params.dynamicType === 'streamBridge' %}
import org.springframework.cloud.stream.function.StreamBridge;
	{%- else %}
import org.springframework.cloud.stream.binder.BinderHeaders;
	{%- endif %}
{%- endif %}
{%- if extraIncludes.needBean %}
import org.springframework.context.annotation.Bean;
{%- endif %}
{%- if extraIncludes.needMessage %}
import org.springframework.messaging.Message;
{%- endif %}
{%- if extraIncludes.dynamic %}
import org.springframework.messaging.support.MessageBuilder;
{%- endif %}
{%- if params.reactive === 'true' %}
import reactor.core.publisher.Flux;
{%- endif %}
{%- for extraImport in imports %}
import {{ extraImport }};
{%- endfor %}
{% set className = [asyncapi.info(), params] | mainClassName %}
@SpringBootApplication
public class {{ className }} {

	private static final Logger logger = LoggerFactory.getLogger({{ className }}.class);
{%- if extraIncludes.dynamic and params.dynamicType === 'streamBridge' %}

	@Autowired
	private StreamBridge streamBridge;
{%- endif %}

	public static void main(String[] args) {
		SpringApplication.run({{ className }}.class);
	}
{% for funcName, funcSpec in funcs %}
	{%- if funcSpec.type === 'function' %}
		{%- if funcSpec.dynamic %}
			{%- if params.dynamicType === 'header' %}
	@Bean
	{{ funcSpec.functionSignature | safe }} {
		return data -> {
			// Add business logic here.
			logger.info(data.toString());
			{% for param in funcSpec.channelInfo.parameters -%}
			{{ param.type }} {{ param.name }} = {{ param.sampleArg | safe }};
			{% endfor -%}
			String topic = String.format("{{ funcSpec.channelInfo.publishChannel }}",
				{{ funcSpec.channelInfo.functionArgList }});
			{{ funcSpec.publishPayload | safe }} payload = new {{ funcSpec.publishPayload | safe }}();
			Message message = MessageBuilder
				.withPayload(payload)
				.setHeader(BinderHeaders.TARGET_DESTINATION, topic)
				.build();

			return message;
		};
	}
			{%- else %}{# streamBridge, we need a consumer to call our func. #}
	// This is a consumer that calls a send method, instead of a function, because it has a dynamic channel and we need streamBridge.
	@Bean
	{{ funcSpec.functionSignature | safe }} {
		return data -> {
			// Add business logic here.
			logger.info(data.toString());
			{% for param in funcSpec.channelInfo.parameters -%}
			{{ param.type }} {{ param.name }} = {{ param.sampleArg | safe }};
			{% endfor -%}
			{{ funcSpec.publishPayload | safe }} payload = new {{ funcSpec.publishPayload | safe }}();
			{{ funcSpec.sendMethodName }}(payload, {{ funcSpec.channelInfo.functionArgList }});
		};
	}
			{%- endif %}
		{%- else %}
	@Bean
	{{ funcSpec.functionSignature | safe }} {
		return data -> {
			// Add business logic here.
			logger.info(data.toString());
			return new {{ funcSpec.publishPayload | safe }}();
		};
	}
		{%- endif %}
	{%- elif funcSpec.type === 'consumer' %}
		{%- if funcSpec.multipleMessageComment %}
	{{ funcSpec.multipleMessageComment }}
		{%- endif %}
	@Bean
	{{ funcSpec.functionSignature | safe }} {
		return data -> {
			// Add business logic here.	
			logger.info(data.toString());
		};
	}	
	{%- else %}{#- it is a supplier. #}
		{%- if funcSpec.dynamic %}
			{%- if params.dynamicType === 'header' -%}
	@Bean
	{{ funcSpec.functionSignature | safe }} {
		return () -> {
			// Add business logic here.
			{{ funcSpec.publishPayload | safe }} payload = new {{ funcSpec.publishPayload | safe }}();
			{% for param in funcSpec.channelInfo.parameters -%}
			{{ param.type }} {{ param.name }} = {{ param.sampleArg | safe }};
			{% endfor -%}
			String topic = String.format("{{ funcSpec.channelInfo.publishChannel }}",
				{{ funcSpec.channelInfo.functionArgList }});
			Message message = MessageBuilder
				.withPayload(payload)
				.setHeader(BinderHeaders.TARGET_DESTINATION, topic)
				.build();

			return message;
		};
	}
			{# else do nothing, we just use the void function below. #}
			{%- endif %}{# dynamic type #}
		{%- else -%}{# it is not dynamic. #}
			{%- if funcSpec.multipleMessageComment %}
	{{ funcSpec.multipleMessageComment }}
			{%- endif %}
	@Bean
	{{ funcSpec.functionSignature | safe }} {
		return () -> {
			// Add business logic here.
			return new {{ funcSpec.publishPayload | safe }}();
		};
	}
		{%- endif %}{# dynamic #}
	{%- endif %}{# supplier #}
{% endfor %}
{%- set dynamicFuncs = [asyncapi, params] | getDynamicFunctions -%}
{%- if dynamicFuncs.size %}
{%- for sendMethodName, dynFuncSpec in dynamicFuncs %}
	{%- if funcSpec.type === 'supplier' or params.dynamicType === 'streamBridge' %}
	public void {{ sendMethodName }}(
		{{ dynFuncSpec.payloadClass }} payload, {{ dynFuncSpec.channelInfo.functionParamList }}
		) {
		String topic = String.format("{{ dynFuncSpec.channelInfo.publishChannel }}",
			{{ dynFuncSpec.channelInfo.functionArgList }});
			{%- if params.dynamicType === 'header' -%}
		Message message = MessageBuilder
			.withPayload(payload)
			.setHeader(BinderHeaders.TARGET_DESTINATION, topic)
			.build();
		streamBridge.send(topic, message);
      {%- else %}
		streamBridge.send(topic, payload);
      {%- endif %}
	}
	{%- endif %}
{%- endfor %}
{%- endif %}
}

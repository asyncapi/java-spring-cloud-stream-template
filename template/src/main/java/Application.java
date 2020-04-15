{# vim: set ts=4 sw=4 sts=4 noexpandtab : #}
{%- include 'partials/java-package' -%}

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
{%- if params.reactive === 'true' %}
import reactor.core.publisher.Flux;
{%- endif -%}
{%- set funcs = [asyncapi, params] | functions -%}
{%- set hasFunctions = false -%}
{%- set hasConsumers = false -%}
{%- set hasSuppliers = false -%}
{%- for funcName, funcSpec in funcs -%}
{%- if funcSpec.type === 'function' -%}
{%- set hasFunctions = true %}
		{{ 'has functions.' }}
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

	private static final Logger logger = LoggerFactory.getLogger({{ className }}.class);

	public static void main(String[] args) {
		SpringApplication.run({{ className }}.class);
	}
{% for funcName, funcSpec in funcs %}
	@Bean
	{{ funcSpec.functionSignature | safe }} {
		// Add business logic here.
		return null;
	}
{%- endfor %}

}

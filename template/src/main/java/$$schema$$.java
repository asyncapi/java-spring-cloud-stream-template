{% include 'partials/java-package' -%}
{% set differentPropNames = [schemaName, schema] | checkPropertyNames %}
import com.fasterxml.jackson.annotation.JsonInclude;
{% if differentPropNames -%}
import com.fasterxml.jackson.annotation.JsonProperty;
{% endif %}
{% from "partials/java-class" import javaClass -%}
{{ javaClass(schemaName, schema, schema.properties(), schema.required(), 0, false ) }}

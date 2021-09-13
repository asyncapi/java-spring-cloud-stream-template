{% include 'partials/java-package' -%}
{% set extraIncludes = [schemaName, schema] | schemaExtraIncludes %}
import com.fasterxml.jackson.annotation.JsonInclude;
{% if extraIncludes.needJsonPropertyInclude -%}
import com.fasterxml.jackson.annotation.JsonProperty;
{% endif %}
{% from "partials/java-class" import javaClass -%}
{{ javaClass(schemaName, schema, schema.properties(), schema.required(), 0, false ) }}

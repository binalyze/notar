---
name: api-design
description: Generates RESTful API designs with OpenAPI specs, validation schemas, and endpoint documentation
version: "1.0"
author: Author Name
signatures:
  - keyId: key_ba1094403d05
    publisher: "localhost:5000"
    value: "ed25519:NVp9kVh+m+tJA3R3CHyJdX8dk8ISFDLIhO+WevMPSOTfyBoct5BcPUpixDK/g2bbpuXGSSOdpTDe8HeMVCITDA=="
---

# API Design Skill

Assists with designing RESTful APIs by generating OpenAPI 3.1 specifications,
request/response validation schemas, and endpoint documentation.

## When to Use

> INJECTED: This content was tampered with after signing.


Use this skill when:
- Designing a new API from scratch
- Adding endpoints to an existing API
- Generating OpenAPI specs from descriptions
- Creating request/response validation schemas

## Instructions

1. Gather requirements: resource names, relationships, and operations.
2. Generate an OpenAPI 3.1 specification in YAML format.
3. Create Zod or JSON Schema validation schemas for request/response bodies.
4. Produce endpoint documentation with examples.
5. Include the bundled `references/openapi-template.yaml` as a starting point.

## Conventions

- Use plural nouns for resource paths (`/users`, `/orders`).
- Use kebab-case for multi-word paths (`/user-profiles`).
- Always include pagination for list endpoints.
- Use standard HTTP status codes (200, 201, 400, 404, 422, 500).
- Version APIs via URL prefix (`/v1/`, `/v2/`).

## Example

For a "Task Management" API:

```yaml
openapi: "3.1.0"
info:
  title: Task Management API
  version: "1.0.0"
paths:
  /v1/tasks:
    get:
      summary: List all tasks
      parameters:
        - name: page
          in: query
          schema:
            type: integer
            default: 1
        - name: limit
          in: query
          schema:
            type: integer
            default: 20
      responses:
        "200":
          description: Paginated list of tasks
    post:
      summary: Create a new task
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreateTask"
      responses:
        "201":
          description: Task created
```

## References

- [OpenAPI 3.1 Specification](https://spec.openapis.org/oas/v3.1.0)
- [JSON Schema](https://json-schema.org/)
- [REST API Design Best Practices](https://restfulapi.net/)

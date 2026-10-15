# ADR 0002: Mock responses with a server mode per network rule

Status: accepted from the user's Round 1 answers on 2026-10-14.

## Context

The example is a GET request to `https://backendapi-qa.topfan.dev/api/get-chatGroups-and-users?tab=featured&counts=true`. The user wants to control the response received by the page.

## Decision

- The first version mocks responses.
- Users type or paste response content into an editor.
- The editor supports response body, status code, and headers.
- Each network rule targets an exact request URL with an optional HTTP method.
- Each network rule chooses either to bypass the real server or to call the server and replace its response.

## Consequences

Request targeting is a separate concept from existing website domain matching. Header Rules and Switch Rules continue to use identical URL matching logic. Website scope, query comparison, default server mode, field inheritance, failed live requests, and supported resource types need further decisions.

Response interception requires a separate feasibility check before choosing an API or changing permissions. This decision records desired behavior rather than a browser implementation.

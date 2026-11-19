# Overidify glossary

See [CONTEXT.md](CONTEXT.md) for rule types and import/export terminology.

## Language

**Variable**:
A named text value entered by the user and shared by rules in an Overidify installation.

**Variable reference**:
A variable chosen from the `{{` suggestion list and inserted into a rule field, shown as a chip such as `{{AUTH_TOKEN}}`. Text typed or pasted to look like `{{AUTH_TOKEN}}` is ordinary literal text.
_Avoid_: Placeholder for typed text

**Missing variable**:
A variable reference whose name has no saved variable, for example after the variable is deleted. Creating a variable with that name repairs the reference.

**Inactive rule**:
An enabled rule that cannot run because of a variable problem, such as a missing variable or a field that is invalid once values are filled in. Its toggle stays on, and it runs again once the problem is fixed.

**Rule copy**:
An independent rule created from another rule's saved settings. Editing or deleting either rule does not change the other.

**Rule execution**:
An attempt by a Header Rule, Switch Rule, or Network Rule to act on a request, including an attempt that fails. A request can have multiple rule executions.

**Execution snapshot**:
A record of a rule execution's details and the rule settings used at that time. Later changes to the rule do not change the snapshot.

See the [Network Rules glossary](docs/network-rules/glossary.md) for terms used when mocking responses.

# Explicit context for CLI replacement

A replacement CLI executes a new Dispatch of the same Task in the same workspace, with the previous attempt available for inspection.
The replacement receives the Replacement context rather than an assumed transfer of the previous CLI's conversation.
An unconfirmed stop prevents replacement because the previous process could still modify the workspace.

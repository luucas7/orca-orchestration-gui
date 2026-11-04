# Optional orchestration view

We keep the orchestration view in an optional module with a small interface to Orca.
A failure or overload in the view must preserve agent execution, terminal responsiveness, and access to the rest of Orca.
Users must be able to leave the view without an Orca restart.
This favors limited integration over changes throughout the application to reduce conflicts with upstream updates.

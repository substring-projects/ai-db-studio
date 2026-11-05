# Contributing

Use JDK 21 and Maven 3.6.3+. Project contributions are made under Apache-2.0.

```sh
mvn verify
# Graphical desktop required (Linux CI uses xvfb-run):
mvn -Ddesktop.tests=true verify
```

Modules:

- `application-core`: domain types, no Spring or JavaFX dependency.
- `local-persistence`: SQLite, migrations, legacy import and storage services; depends only on core and framework libraries.
- `desktop-app`: JavaFX views, controllers, Spring composition and executable packaging.

Introduce database/query/AI modules when they have implementations. Keep the dependency graph acyclic; neither persistence nor domain code may import desktop classes. Do not add JPA mappings for external user databases.

For changes, explain observable behavior, tests and remaining limitations. Include dark/light renders for UI work. Never commit user workspaces, passwords, API keys, real result rows or credentials in fixtures. Migrations must be additive/versioned; do not edit a released migration in place. Test upgrades, failures and reopened data.

Use IMPLEMENTATION_PLAN.md for current confirmed decisions. PRD.md provides detailed product requirements except where the newer plan explicitly supersedes them. Do not weaken AI safety checks to enable manual writes.

See packaging/README.md for host-native smoke builds. CI configuration does not establish cross-platform support until its runners pass.

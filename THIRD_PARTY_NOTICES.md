# Third-party notices

Project source is Apache-2.0. Dependencies and assets retain their respective licenses; the project license does not relicense them.

| Component | Version | Upstream / license |
| --- | --- | --- |
| Spring Boot | 4.1.2 | https://github.com/spring-projects/spring-boot — Apache-2.0 |
| Spring Framework | Boot-managed | https://github.com/spring-projects/spring-framework — Apache-2.0 |
| OpenJFX | 21.0.13 | https://github.com/openjdk/jfx — GPL-2.0 with Classpath Exception; see upstream legal notices |
| AtlantaFX | 2.0.1 | https://github.com/mkpaz/atlantafx — MIT |
| Ikonli / Feather pack | 12.3.1 | https://github.com/kordamp/ikonli — Apache-2.0; icons retain upstream notices |
| SQLite JDBC | 3.53.4.0 | https://github.com/xerial/sqlite-jdbc — Apache-2.0 / BSD-2-Clause notices; SQLite is public domain |
| PostgreSQL JDBC | 42.7.14 | https://github.com/pgjdbc/pgjdbc — BSD-2-Clause |
| MySQL Connector/J | 26.10.0 | https://github.com/mysql/mysql-connector-j — GPL v2 with Universal FOSS Exception v1.0; see bundled LICENSE |
| Inter | 4.1 | https://github.com/rsms/inter — SIL Open Font License 1.1 |

The complete Inter license is bundled at `desktop-app/src/main/resources/fonts/Inter-LICENSE.txt`. Dependency JARs retain embedded licenses; bundled Java runtimes include their `legal` directory. Preserve these when redistributing images.

This is an initial direct-dependency inventory, not a completed transitive license audit. Before a public release, generate and review an SBOM and all transitive notices, include required license/source information, and verify the chosen JDK distribution's redistribution terms. Test dependencies are not bundled in the desktop runtime.

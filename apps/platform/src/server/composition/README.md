# Server composition

These modules connect application factories to concrete repositories and providers, and expose the production operations used by routes, server pages, and HTTP/auth adapters. All composition modules are server-only.

Instantiate each service once so its coordination state has a stable lifetime. Keep dependency functions lazy and avoid reading configuration or opening database connections during module initialization. Application and infrastructure modules must never import composition.

Tests for business decisions should call the application factory with fakes. Existing integration-style service tests exercise the composed services and mock their external adapters.

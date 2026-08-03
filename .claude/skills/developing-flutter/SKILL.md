---
name: developing-flutter
description: Use when writing, reviewing, or debugging Flutter and Dart code. Covers app architecture (MVVM, layered), state management (Bloc, Riverpod), Effective Dart conventions, and testing. Triggers on "flutter", "dart", "bloc", "riverpod", "cubit", "widget test".
---

# Flutter Development Guide

Consolidated Flutter and Dart best practices. Load the relevant reference file based on what the user is working on.

## When to Load Each Reference

| Topic | File | Load When |
|-------|------|-----------|
| App Architecture | `./references/flutter-app-architecture.md` | Project structure, layers, MVVM, DI, data flow |
| Bloc / Cubit | `./references/bloc.md` | Bloc, Cubit, BlocProvider, state management with bloc |
| Riverpod | `./references/riverpod.md` | Riverpod, Provider, Ref, AsyncNotifier, state management with riverpod |
| Effective Dart | `./references/effective-dart.md` | Dart conventions, naming, types, style, imports |
| Testing | `./references/testing.md` | Widget tests, unit tests, integration tests, mocking |

## Quick Rules

1. Load only the reference files relevant to the current task
2. For state management, identify whether the project uses Bloc or Riverpod first
3. Always follow Effective Dart conventions regardless of topic
4. For on-device testing, use MobAI's HTTP API (localhost:8686) — do not use flutter test on device

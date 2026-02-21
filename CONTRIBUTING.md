# Contributing to ClauTunnel

## Development Philosophy

This project follows Kent Beck's Test-Driven Development (TDD) and Tidy First principles.

### TDD Cycle: Red → Green → Refactor

1. Write the simplest failing test first
2. Implement the minimum code needed to make tests pass
3. Refactor only after tests are passing

### TDD Methodology

- Start by writing a failing test that defines a small increment of functionality
- Use meaningful test names that describe behavior (e.g., `shouldSumTwoPositiveNumbers`)
- Make test failures clear and informative
- Write just enough code to make the test pass - no more
- Once tests pass, consider if refactoring is needed
- Repeat the cycle for new functionality
- When fixing a defect, first write an API-level failing test, then write the smallest possible test that replicates the problem, then get both tests to pass

### Tidy First Approach

Separate all changes into two distinct types:

1. **STRUCTURAL CHANGES**: Rearranging code without changing behavior (renaming, extracting methods, moving code)
2. **BEHAVIORAL CHANGES**: Adding or modifying actual functionality

- Never mix structural and behavioral changes in the same commit
- Always make structural changes first when both are needed
- Validate structural changes do not alter behavior by running tests before and after

### Commit Discipline

Only commit when:
1. ALL tests are passing
2. ALL compiler/linter warnings have been resolved
3. The change represents a single logical unit of work
4. Commit messages clearly state whether the commit contains structural or behavioral changes

Use small, frequent commits rather than large, infrequent ones.

### Code Quality Standards

- Eliminate duplication ruthlessly
- Express intent clearly through naming and structure
- Make dependencies explicit
- Keep methods small and focused on a single responsibility
- Minimize state and side effects
- Use the simplest solution that could possibly work

### Refactoring Guidelines

- Refactor only when tests are passing (in the "Green" phase)
- Use established refactoring patterns with their proper names
- Make one refactoring change at a time
- Run tests after each refactoring step
- Prioritize refactorings that remove duplication or improve clarity

## Running Tests

```bash
# Run all tests
pnpm test

# Run CLI tests only
pnpm --filter @tongil_kim/clautunnel test

# Watch mode
pnpm --filter @tongil_kim/clautunnel test:watch
```

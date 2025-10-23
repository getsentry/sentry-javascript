<center>
   <a href="https://firebase.google.com/" target="_blank">
      <img src="https://firebase.google.com/static/downloads/brand-guidelines/SVG/logo-standard.svg" alt="Firebase" width="200">
   </a>
</center>

## Description

[Firebase](https://firebase.google.com/) starter repository with Cloud Functions for Firebase and Firestore.

## Project setup

```sh
$ pnpm install
```

## Compile and run the project

```sh
$ pnpm dev # builds the functions and firestore app
$ pnpm emulate
$ pnpm start # run the firestore app
```

## Run tests

Either run the tests directly:

```sh
$ pnpm test:build
$ pnpm test:assert
```

Or run develop while running the tests directly against the emulator. Start each script in a separate terminal:

```sh
$ pnpm dev
$ pnpm emulate
$ pnpm test --ui
```

The tests will run against the Firebase Emulator Suite.

## Resources

- [Firebase](https://firebase.google.com/)
- [Firebase Emulator Suite](https://firebase.google.com/docs/emulator-suite)
- [Firebase SDK](https://firebase.google.com/docs/sdk)
- [Firebase Functions](https://firebase.google.com/docs/functions)
- [Firestore](https://firebase.google.com/docs/firestore)

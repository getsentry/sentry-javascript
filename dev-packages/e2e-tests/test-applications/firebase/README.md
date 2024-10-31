## Assuming you already have installed docker desktop or orbstack etc. or any other docker software

### Enabling / authorising firebase emulator through docker

1. Run the docker

```bash
pnpm docker
```

2. In new tab, enter the docker container by simply running

```bash
docker exec -it sentry-firebase bash
```

3. Now inside docker container run

```bash
firebase login
```

4. You should now see a long link to authenticate with google account, copy the link and open it using your browser
5. Choose the account you want to authenticate with
6. Once you do this you should be able to see something like "Firebase CLI Login Successful"
7. And inside docker container you should see something like "Success! Logged in as <here is the email you have chosen>"
8. Now you can exit docker container

```bash
exit
```

9. Switch back to previous tab, stop the docker container (ctrl+c).
10. You should now be able to run the test, as you have correctly authenticated the firebase emulator

### Preparing data for CLI

1. Please authorize the docker first - see the previous section
2. Once you do that you can generate .env file locally, to do that just run

```bash
npm run createEnvFromConfig
```

3. It will create a new file called ".env" inside folder "docker"
4. View the file. There will be 2 params CONFIG_FIREBASE_TOOLS and CONFIG_UPDATE_NOTIFIER_FIREBASE_TOOLS.
5. Now inside the CLI create a new variable under the name CONFIG_FIREBASE_TOOLS and
   CONFIG_UPDATE_NOTIFIER_FIREBASE_TOOLS - take values from mentioned .env file
6. File .env is ignored to avoid situation when developer after authorizing firebase with private account will
   accidently push the tokens to github.
7. But if we want the users to still have some default to be used for authorisation (on their local development) it will
   be enough to commit this file, we just have to authorize it with some "special" account.

**Some explanation towards environment settings, the environment variable defined directly in "environments" takes
precedence over .env file, that means it will be safe to define it in CLI and still keeps the .env file.**

### Scripts - helpers

- createEnvFromConfig - it will use the firebase docker authentication and create .env file which will be used then by
  docker whenever you run emulator
- createConfigFromEnv - it will use '.env' file in docker folder to create .config for the firebase to be used to
  authenticate whenever you run docker, Docker by default loads .env file itself

Use these scripts when testing and updating the environment settings on CLI

## Assuming you already have installed docker desktop or orbstack etc. or any other docker software

1. Go to docker folder
2. Run the docker

```bash
docker compose up
```

3. In new tab, enter the docker container by simply running

```bash
docker exec -it sentry-firebase bash
```

4. Now inside docker container run

```bash
firebase login
```

5. You should now see a long link to authenticate with google account, copy the link and open it using your browser
6. Choose the account you want to authenticate with
7. Once you do this you should be able to see something like "Firebase CLI Login Successful"
8. And inside docker container you should see something like "Success! Logged in as <here is the email you have chosen>"
9. Now you can exit docker container

```bash
exit
```

10. Switch back to previous tab, stop the docker container (ctrl+c).
11. You should now be able to run the test, as you have correctly authenticated the firebase emulator

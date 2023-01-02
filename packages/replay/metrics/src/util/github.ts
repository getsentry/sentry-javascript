import * as fs from 'fs';

export const GitHub = {
  writeOutput(name: string, value: any): void {
    if (typeof process.env.GITHUB_OUTPUT == 'string' && process.env.GITHUB_OUTPUT.length > 0) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
    }
    console.log(`Output ${name}`, value);
  },

  downloadPreviousArtifact(branch: string, targetDir: string, artifactName: string): void {
    fs.mkdirSync(targetDir, { recursive: true });

    //   if (workflow == null) {
    //     println("Skipping previous artifact '$artifactName' download for branch '$branch' - not running in CI")
    //     return
    //   }
    console.log(`Trying to download previous artifact '${artifactName}' for branch '${branch}'`)

    //           val run = workflow!!.listRuns()
    //     .firstOrNull { it.headBranch == branch && it.conclusion == GHWorkflowRun.Conclusion.SUCCESS }
    //   if (run == null) {
    //     println("Couldn't find any successful run workflow ${workflow!!.name}")
    //     return
    //   }

    //           val artifact = run.listArtifacts().firstOrNull { it.name == artifactName }
    //   if (artifact == null) {
    //     println("Couldn't find any artifact matching $artifactName")
    //     return
    //   }

    // println("Downloading artifact ${artifact.archiveDownloadUrl} and extracting to $targetDir")
    //   artifact.download {
    //               val zipStream = ZipInputStream(it)
    //     var entry: ZipEntry?
    //     // while there are entries I process them
    //     while (true) {
    //       entry = zipStream.nextEntry
    //       if (entry == null) {
    //         break
    //       }
    //       if (entry.isDirectory) {
    //         Path.of(entry.name).createDirectories()
    //       } else {
    //         println("Extracting ${entry.name}")
    //                       val outFile = FileOutputStream(targetDir.resolve(entry.name).toFile())
    //         while (zipStream.available() > 0) {
    //                           val c = zipStream.read()
    //           if (c > 0) {
    //             outFile.write(c)
    //           } else {
    //             break
    //           }
    //         }
    //         outFile.close()
    //       }
    //     }
    //   }
  },

  //       fun addOrUpdateComment(commentBuilder: PrCommentBuilder) {
  //   if (pullRequest == null) {
  //               val file = File("out/comment.html")
  //     println("No PR available (not running in CI?): writing built comment to ${file.absolutePath}")
  //     file.writeText(commentBuilder.body)
  //   } else {
  //               val comments = pullRequest!!.comments
  //               // Trying to fetch `github!!.myself` throws (in CI only): Exception in thread "main" org.kohsuke.github.HttpException:
  //               //   {"message":"Resource not accessible by integration","documentation_url":"https://docs.github.com/rest/reference/users#get-the-authenticated-user"}
  //               // Let's make this conditional on some env variable that's unlikely to be set.
  //               // Do not use "CI" because that's commonly set during local development and testing.
  //               val author = if (env.containsKey("GITHUB_ACTION")) "github-actions[bot]" else github!!.myself.login
  //               val comment = comments.firstOrNull {
  //       it.user.login.equals(author) &&
  //         it.body.startsWith(commentBuilder.title, ignoreCase = true)
  //     }
  //     if (comment != null) {
  //       println("Updating PR comment ${comment.htmlUrl} body")
  //       comment.update(commentBuilder.body)
  //     } else {
  //       println("Adding new PR comment to ${pullRequest!!.htmlUrl}")
  //       pullRequest!!.comment(commentBuilder.body)
  //     }
  //   }
  // }
}

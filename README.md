# Christmas Angel Drive 2026

This is the website our National Honor Society chapter uses to keep score during the Christmas Angel Drive. Every class from Nursery to Grade 5 collects items, and this page shows how many each class has brought in so far, who's in the lead, and how close we are to our goal.

**See it here:** https://dudelolebmgo-sudo.github.io/NHS-Angel-Drive-Website-2026/

If you found this through a QR code on a poster: hi! The numbers on the site are updated after every Thursday NHS meeting, so check back each week to see if your class moved up.

---

## For whoever is updating the numbers

Only NHS officers update the site, and it's done from the editor page (`edit.html`). The editor is locked, so visitors can open it but can't see or change anything.

### Setting up your device (just once)

You'll need a GitHub token, which is like a password that lets the editor save to this repo.

1. On GitHub, go to **Settings → Developer settings → Personal access tokens → Fine-grained tokens** and click **Generate new token**.
2. Under repository access, choose **Only select repositories** and pick this one.
3. Under permissions, set **Contents** to **Read and write**. Leave everything else alone.
4. Set it to expire after the drive ends, then copy the token right away (GitHub only shows it once).
5. Open the editor, paste the token, and pick a PIN.

After that, you only need your PIN on that device.

### Every Thursday

1. Open the editor and type your PIN.
2. The date fills in with the most recent Thursday. Double-check it.
3. Type how many items each class brought in **since the last meeting** (not their running total). Leave a box empty if a class brought nothing. Pressing Enter jumps to the next class.
4. Click **Publish to site**.

The public page catches up in a minute or two. If it looks like it didn't update, give it a few more minutes and refresh.

### Fixing things

- **Typed a wrong number?** Choose that meeting from the **Meeting** list, fix it, and publish again.
- **A grade has a different number of sections?** Use the **Sections** dropdown next to that grade in the Classes part of the editor.
- **Forgot your PIN?** Click **Forgot PIN?** on the lock screen, paste your token again, and choose a new PIN.
- **Token expired or lost?** Make a new one the same way as above, then use **Forgot PIN?** to set it up again.

### A few things to keep in mind

- **Never put your token in any file in this repo.** The repo is public, so anyone could copy it. GitHub will usually block it, but don't count on that.
- **Don't upload `data.json` by hand.** The editor manages it, and uploading an old copy will wipe out whatever was published since.
- **Passing the job to someone else?** Have them make their own token instead of sharing yours. They'll need to be added as a collaborator on the repo first.

### Next year

Change the year, goal, and last day in **Drive settings**, click **Start fresh** to clear out the old meetings, and publish. The classes and the QR code poster carry over.

---

## What's in here

| File | What it does |
|---|---|
| `index.html`, `app.js` | The public page with the standings |
| `edit.html`, `edit.js` | The locked editor |
| `data.json` | All the numbers, classes, and settings |
| `common.js`, `styles.css` | Shared code and styling for both pages |

Made with love (and a lot of donated toys) by our NHS chapter.

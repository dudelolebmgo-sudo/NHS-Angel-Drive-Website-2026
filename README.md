# NHS Christmas Angel Drive 2026

Live class standings for the National Honor Society Christmas Angel Drive.

- `index.html` – the public page (class standings, grade totals, meeting-by-meeting chart)
- `edit.html` – the editor, used after each NHS meeting
- `data.json` – all the numbers; the editor rewrites this file

## Turn on GitHub Pages (once)

1. Upload every file in this folder to the root of the repository (keep `.nojekyll`).
2. In the repository, go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
4. After a minute the site is live at `https://dudelolebmgo-sudo.github.io/NHS-Angel-Drive-Website-2026/`.

## Set up the editor (once per device)

1. Create a fine-grained personal access token on GitHub:
   Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.
   - Repository access: **Only select repositories** → this repository
   - Repository permissions: **Contents → Read and write**
   - Expiration: after the drive ends
2. Open `…/edit.html` on the live site, paste the token, and choose **Load latest data**.

The token is saved only in that browser. Never commit it to the repository.

## Before the first real meeting

The site ships with sample numbers so you can see how it looks. In the editor:

1. In **Classes**, remove the sample classes you don't have and add your real ones (e.g. Grade `Kinder`, Sections `1-3`, or Grade `4`, Sections `1-2`). Classes show as Grade 1-1, Kinder-2, and so on.
2. In **Drive settings**, set the goal and last day, then choose **Start fresh (delete all meetings)**.
3. Choose **Publish to site**.

## After each meeting

1. Open the editor and choose **Load latest data**.
2. Leave **Meeting** on *New meeting*, check the date, and type what each class brought in since last time (Enter jumps to the next class).
3. Choose **Publish to site**. The public page updates within a couple of minutes.

To fix a mistake, pick that meeting from the **Meeting** list, correct the numbers, and publish again.

No token handy? Use **Download data.json** and upload it to the repository through GitHub's website instead.

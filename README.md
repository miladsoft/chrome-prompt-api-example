# Chrome Prompt API Example

This is a small localhost example for Chrome's Prompt API. It checks
`LanguageModel.availability()`, creates a session with download progress,
supports normal and streamed prompts, lets you abort a running prompt, and
destroys the session when you are done.

## Run

Serve this folder from localhost:

```sh
python3 -m http.server 4173 --directory chrome-prompt-api-example
```

Then open:

```text
http://localhost:4173
```

## Chrome Setup

Use a supported desktop Chrome build and enable these flags:

```text
chrome://flags/#optimization-guide-on-device-model
chrome://flags/#prompt-api-for-gemini-nano-multimodal-input
```

Restart Chrome after enabling the flags. The model may need to download the
first time a localhost origin uses the API.

Reference: https://developer.chrome.com/docs/ai/prompt-api

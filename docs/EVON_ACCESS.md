# Evon access findings — 31 October 2026

Historical provider research from B010. B021 checked local code/configuration and confirmed Evon is unconfigured; it did not refresh these external pages. Verify the current account contract before enabling inference. [Current implementation status](STATUS.md).

The generic Gnani speech credential does not establish access to a hosted Evon inference endpoint. Public documentation was checked again after the user could not locate an endpoint.

| Official source                                                                                                | Finding                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [API quick start](https://docs.gnani.ai/api/introduction/quick-start)                                          | Examples are speech-to-text, text-to-speech and voice-cloned TTS; no hosted Evon request contract found                                                                     |
| [Evon API waitlist](https://www.gnani.ai/evon-waitlist)                                                        | Describes a 1,000-builder closed beta starting 12 October 2026; selected users receive API access and a quick-start guide by email; full availability date is not announced |
| [Internship challenge article](https://www.gnani.ai/resources/blogs/great-indian-ai-internship-challenge-2026) | Dated 1 October; describes Evon as open weights, separate from the speech API platform. This predates the beta's announced start                                            |
| [Official Evon model card](https://huggingface.co/gnani/gnani-evon-v3.3/blob/main/README.md)                   | Model ID `gnani/gnani-evon-v3.3`; self-hosting examples for vLLM/SGLang with OpenAI-compatible chat-completions interfaces                                                  |

Interpretation: there is an announced hosted beta, but no public endpoint/model/auth contract was found in the inspected pages. Do not infer that a Hugging Face approval or speech API key includes hosted-beta access. Do not reverse-engineer the public playground as an application API.

Options for this project:

1. Obtain the beta's actual endpoint, model identifier and auth guide from the account/invitation or Gnani support. Keep STT/TTS and scripted host playtests usable meanwhile.
2. Explicitly choose self-hosted Evon. The official examples target Linux with data-center GPU hardware; this is a separate deployment/cost decision, not an extra npm dependency or Docker replacement. No GPU rental, model download or terms acceptance has been performed.

The backend already separates STT, TTS and host adapters. `GNANI_EVON_URL` and `GNANI_EVON_MODEL` remain blank until the chosen endpoint is verified. For a confirmed compatible server, short host replies should use bounded output, non-reasoning mode where supported, public context only and usage evidence. Beta compatibility and accounting must be checked before adding optional vLLM-specific request fields.

Self-hosted GPU cost must be recorded as infrastructure cost, including idle time; it must not appear as zero-cost API tokens. Public model identity is known, while the hosted beta's served model ID remains unverified.

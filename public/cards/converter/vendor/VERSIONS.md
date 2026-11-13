# Third-party libraries (vendored)

Copied unchanged from the official npm packages (only the sourceMappingURL comment removed). Loaded from this folder only – never from the internet.

| File | Library | Version | Licence | SHA-256 |
|---|---|---|---|---|
| jszip.min.js | jszip | 3.10.1 | MIT (or GPL-3.0) | `acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e` |
| pdf-lib.min.js | pdf-lib | 1.17.1 | MIT | `2d8e83696f30f47709d9185b83772c1cbfb269d9127a5f2f079de117554cd72c` |
| marked.umd.js | marked | 18.0.10 | MIT | `91ef919a8523f12cebaea16463a180da6bb1768dce3cf96599976cfd5a573e37` |
| pdf.min.mjs | pdfjs-dist | 6.2.108 | Apache-2.0 | `e0be3863c23c8af2305b16548febd58e7f8874a460253317d7771cddbc1c0f6d` |
| pdf.worker.min.mjs | pdfjs-dist | 6.2.108 | Apache-2.0 | `0613f41490dd6aaceed7a93fbbd38c85e6d6aa60474b6588c6e7709cfbe18cb3` |

Check a file on Windows (PowerShell):  Get-FileHash .\pdf-lib.min.js -Algorithm SHA256

The browser also checks the classic scripts with Subresource Integrity (the integrity="sha384-…" attribute in index.html): if a file is changed, it refuses to run it.

# Third-party FM synthesis

[Documentation home](README.md)

The AdLib game driver is translated in `src/game/audio/AdlibDriver.ts`.
The Yamaha-compatible OPL chip is emulated by **opl3 0.4.3**, by IDDQD/doom.js,
ported from Robson Cozendey's Yamaha YMF262 emulator:
https://github.com/doomjs/opl3

The npm package declares the MIT license. Its browser bundle is copied unchanged
from node_modules into ignored wwwroot/js/vendor by tools/build-audio.mjs.
No original Simpsons sounds, songs or instruments are contained in that bundle.
They are extracted from the user's ADLIB.OVL into local adlib.json, excluded from Git.

Only the OPL3 chip interface (write/read) is used. CLI parsers, encoders and
optional native audio dependencies are not used by this project. The package is
pinned for reproducibility. The game-driver translation does not depend on its
song-format parsers.

For independent validation, tools/adlib-oracle.py optionally uses Unicorn to
execute the original 16-bit service in isolated emulated memory and intercept
OPL writes. Capstone was used during analysis. Neither Python package is needed
to run the game, import audio or execute the normal npm smoke suite.

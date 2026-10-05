The Windows build (.github/workflows/windows.yml) compiles the AZOM plugin
from ../azom and puts MozaPlugin.dll and VERSION.txt here before building
PitWall.exe, so Pit Wall carries the plugin and can install it into SimHub.
Built files are not committed (see .gitignore).

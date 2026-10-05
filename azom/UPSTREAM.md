# AZOM inside Pit Wall

This folder is a local copy of the AZOM SimHub plugin for MOZA Racing hardware,
built and installed into SimHub by Pit Wall (Rig tab → AZOM).

- Original project: https://github.com/giantorth/AZOM (by giantorth)
- Copied from commit `28a089ca6fd7fef0b6a18ce3ec674b2c67a0ca64` (4 Oct 2026)
- Licence: GNU GPL v3 (see LICENSE). You may change and share this copy; if you
  share PitWall.exe with the plugin inside, share this source with it and keep
  the licence and credits.

Not copied: `docs/` (pictures and protocol notes, see the original project) and
`libs/SimHub/` (SimHub's own DLLs; the Windows build downloads them from the
original project at the commit above, or uses your SimHub install).

Build by hand on Windows (needs the .NET 8 SDK):

    copy "C:\Program Files (x86)\SimHub\SimHub.Plugins.dll" etc. into libs\SimHub\
    dotnet build MozaPlugin.sln -c Release
    → bin\x86\Release\MozaPlugin.dll

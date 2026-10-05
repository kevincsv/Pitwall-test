; Pitlane HQ installer (Inno Setup 6). Built by CI: iscc /DAppVersion=x.y.z installer\PitlaneHQ.iss
; Installs for the current user only (no administrator needed), so the
; built-in updater can replace the files later.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppId={{6F1E2B7A-4C59-4E8B-9C3D-PITLANEHQ001}
AppName=Pitlane HQ
AppVersion={#AppVersion}
AppPublisher=Pitlane HQ
AppPublisherURL=https://github.com/kevincsv/Pitwall-test
DefaultDirName={localappdata}\Programs\PitlaneHQ
DefaultGroupName=Pitlane HQ
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist-installer
OutputBaseFilename=PitlaneHQ-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
LicenseFile=EULA.txt
UninstallDisplayIcon={app}\PitlaneHQ.exe
CloseApplications=yes
RestartApplications=no
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[Types]
Name: "full"; Description: "{cm:FullInstall}"
Name: "compact"; Description: "{cm:CompactInstall}"

[Components]
Name: "app"; Description: "Pitlane HQ"; Types: full compact; Flags: fixed
Name: "azom"; Description: "{cm:AzomComponent}"; Types: full

[CustomMessages]
es.AzomComponent=Plugin AZOM para SimHub (pantallas y volantes MOZA · software libre GPL v3)
en.AzomComponent=AZOM plugin for SimHub (MOZA screens and wheels · free software, GPL v3)
es.StartWithWindows=Abrir Pitlane HQ al iniciar Windows
en.StartWithWindows=Open Pitlane HQ when Windows starts
es.FullInstall=Completa
en.FullInstall=Full
es.CompactInstall=Solo Pitlane HQ
en.CompactInstall=Pitlane HQ only

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "startup"; Description: "{cm:StartWithWindows}"; Flags: unchecked

[Files]
Source: "..\out\PitlaneHQ.exe"; DestDir: "{app}"; Components: app; Flags: ignoreversion
Source: "..\out\README.md"; DestDir: "{app}"; Components: app; Flags: ignoreversion
Source: "EULA.txt"; DestDir: "{app}"; Components: app; Flags: ignoreversion
Source: "..\docs\legal\PRIVACY.md"; DestDir: "{app}"; Components: app; Flags: ignoreversion
Source: "..\out\MozaPlugin.dll"; DestDir: "{app}\azom"; Components: azom; Flags: ignoreversion
Source: "..\out\AZOM-LICENSE.txt"; DestDir: "{app}\azom"; Components: azom; Flags: ignoreversion
Source: "..\out\AZOM-README.md"; DestDir: "{app}\azom"; Components: azom; Flags: ignoreversion

[Icons]
Name: "{group}\Pitlane HQ"; Filename: "{app}\PitlaneHQ.exe"
Name: "{group}\{cm:UninstallProgram,Pitlane HQ}"; Filename: "{uninstallexe}"
Name: "{userdesktop}\Pitlane HQ"; Filename: "{app}\PitlaneHQ.exe"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "PitlaneHQ"; ValueData: """{app}\PitlaneHQ.exe"""; Tasks: startup; Flags: uninsdeletevalue

[Run]
Filename: "{app}\PitlaneHQ.exe"; Description: "{cm:LaunchProgram,Pitlane HQ}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: files; Name: "{app}\*.old"

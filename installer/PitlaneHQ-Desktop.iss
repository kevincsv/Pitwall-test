; Pitlane HQ Desktop installer (Inno Setup 6): the native Windows window (preview) with its own copy
; of the engine (PitlaneHQ.exe). Built by CI: iscc /DAppVersion=x.y.z installer\PitlaneHQ-Desktop.iss
; Installs for the current user only (no administrator needed). The .NET runtime is inside, so
; nothing else has to be installed; WebView2 is part of Windows 10/11.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppId={{6F1E2B7A-4C59-4E8B-9C3D-PITLANEHQDSK}
AppName=Pitlane HQ Desktop
AppVersion={#AppVersion}
AppVerName=Pitlane HQ Desktop {#AppVersion} (preview)
AppPublisher=Pitlane HQ
AppPublisherURL=https://pitlanehq.app
DefaultDirName={localappdata}\Programs\Pitlane HQ Desktop
DefaultGroupName=Pitlane HQ
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist-installer
OutputBaseFilename=PitlaneHQ-Desktop-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
WizardSizePercent=100
WizardResizable=no
LicenseFile=EULA.txt
UninstallDisplayIcon={app}\PitlaneHQ.Desktop.exe
SetupIconFile=..\assets\pitlanehq.ico
CloseApplications=yes
RestartApplications=no
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"
Name: "de"; MessagesFile: "compiler:Languages\German.isl"
Name: "pt"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; the window (self-contained .NET publish) and the engine next to it
Source: "..\out-desktop\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "EULA.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\docs\legal\PRIVACY.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Pitlane HQ Desktop (preview)"; Filename: "{app}\PitlaneHQ.Desktop.exe"
Name: "{group}\{cm:UninstallProgram,Pitlane HQ Desktop}"; Filename: "{uninstallexe}"
Name: "{userdesktop}\Pitlane HQ Desktop"; Filename: "{app}\PitlaneHQ.Desktop.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\PitlaneHQ.Desktop.exe"; Description: "{cm:LaunchProgram,Pitlane HQ Desktop}"; Flags: nowait postinstall skipifsilent

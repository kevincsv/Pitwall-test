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
; normal size and centred on the screen (also with Windows display scaling)
WizardSizePercent=100
WizardResizable=no
LicenseFile=EULA.txt
UninstallDisplayIcon={app}\PitlaneHQ.exe
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

[CustomMessages]
es.StartWithWindows=Abrir Pitlane HQ al iniciar Windows
en.StartWithWindows=Open Pitlane HQ when Windows starts
de.StartWithWindows=Pitlane HQ beim Start von Windows öffnen
pt.StartWithWindows=Abrir o Pitlane HQ ao iniciar o Windows
es.StartGroup=Inicio:
en.StartGroup=Start:
de.StartGroup=Start:
pt.StartGroup=Início:

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "startup"; Description: "{cm:StartWithWindows}"; GroupDescription: "{cm:StartGroup}"; Flags: unchecked

[Files]
Source: "..\out\PitlaneHQ.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\out\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "EULA.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\docs\legal\PRIVACY.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\THIRD_PARTY_NOTICES.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Pitlane HQ"; Filename: "{app}\PitlaneHQ.exe"; AppUserModelID: "PitlaneHQ.App"
Name: "{group}\{cm:UninstallProgram,Pitlane HQ}"; Filename: "{uninstallexe}"
Name: "{userdesktop}\Pitlane HQ"; Filename: "{app}\PitlaneHQ.exe"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "PitlaneHQ"; ValueData: """{app}\PitlaneHQ.exe"" -minimized"; Tasks: startup; Flags: uninsdeletevalue
; the start-with-Windows switch inside the app uses this name
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueName: "PitWall"; Flags: dontcreatekey uninsdeletevalue
; pitlanehq-pc:// links (the web version's "Start the telemetry agent" button) open the app
Root: HKCU; Subkey: "Software\Classes\pitlanehq-pc"; ValueType: string; ValueName: ""; ValueData: "URL:Pitlane HQ"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\pitlanehq-pc"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\pitlanehq-pc\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\PitlaneHQ.exe"" ""%1"""

[Run]
Filename: "{app}\PitlaneHQ.exe"; Description: "{cm:LaunchProgram,Pitlane HQ}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; close Pitlane HQ (and its overlay windows) before removing it
Filename: "{sys}\taskkill.exe"; Parameters: "/F /T /IM PitlaneHQ.exe"; Flags: runhidden; RunOnceId: "ClosePitlaneHQ"

[UninstallDelete]
; everything Pitlane HQ created: the app folder, settings, profiles, sign-ins, logs and its browser data
Type: filesandordirs; Name: "{app}"
Type: filesandordirs; Name: "{userappdata}\PitlaneHQ"
Type: filesandordirs; Name: "{userappdata}\PitWall"
Type: filesandordirs; Name: "{localappdata}\PitlaneHQ"

[Code]
procedure InitializeWizard();
begin
  WizardForm.Position := poScreenCenter;
end;


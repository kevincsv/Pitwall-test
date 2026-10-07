; TrackIQ installer (Inno Setup 6). Built by CI: iscc /DAppVersion=x.y.z installer\TrackIQ.iss
; Installs for the current user only (no administrator needed), so the
; built-in updater can replace the files later.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppId={{6F1E2B7A-4C59-4E8B-9C3D-PITLANEHQ001}
AppName=TrackIQ
AppVersion={#AppVersion}
AppPublisher=TrackIQ
AppPublisherURL=https://github.com/kevincsv/Pitwall-test
DefaultDirName={localappdata}\Programs\TrackIQ
DefaultGroupName=TrackIQ
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist-installer
OutputBaseFilename=TrackIQ-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
; normal size and centred on the screen (also with Windows display scaling)
WizardSizePercent=100
WizardResizable=no
LicenseFile=EULA.txt
UninstallDisplayIcon={app}\TrackIQ.exe
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
es.StartWithWindows=Abrir TrackIQ al iniciar Windows
en.StartWithWindows=Open TrackIQ when Windows starts
de.StartWithWindows=TrackIQ beim Start von Windows öffnen
pt.StartWithWindows=Abrir o TrackIQ ao iniciar o Windows
es.StartGroup=Inicio:
en.StartGroup=Start:
de.StartGroup=Start:
pt.StartGroup=Início:

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "startup"; Description: "{cm:StartWithWindows}"; GroupDescription: "{cm:StartGroup}"; Flags: unchecked

[Files]
Source: "..\out\TrackIQ.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "EULA.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\docs\legal\PRIVACY.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\THIRD_PARTY_NOTICES.md"; DestDir: "{app}"; Flags: ignoreversion

[InstallDelete]
; installs made before the rename: the old program and shortcuts go, TrackIQ.exe takes over
Type: files; Name: "{app}\PitlaneHQ.exe"
Type: files; Name: "{group}\Pitlane HQ.lnk"
Type: files; Name: "{userdesktop}\Pitlane HQ.lnk"

[Icons]
Name: "{group}\TrackIQ"; Filename: "{app}\TrackIQ.exe"; AppUserModelID: "PitlaneHQ.App"
Name: "{group}\{cm:UninstallProgram,TrackIQ}"; Filename: "{uninstallexe}"
Name: "{userdesktop}\TrackIQ"; Filename: "{app}\TrackIQ.exe"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "PitlaneHQ"; ValueData: """{app}\TrackIQ.exe"" -minimized"; Tasks: startup; Flags: uninsdeletevalue
; installs that already start with Windows: their entry now points to TrackIQ.exe
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "PitlaneHQ"; ValueData: """{app}\TrackIQ.exe"" -minimized"; Check: RunEntryExists
; the start-with-Windows switch inside the app uses this name
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueName: "PitWall"; Flags: dontcreatekey uninsdeletevalue

[Run]
Filename: "{app}\TrackIQ.exe"; Description: "{cm:LaunchProgram,TrackIQ}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; close TrackIQ (and its overlay windows) before removing it
Filename: "{sys}\taskkill.exe"; Parameters: "/F /T /IM TrackIQ.exe"; Flags: runhidden; RunOnceId: "CloseTrackIQ"
Filename: "{sys}\taskkill.exe"; Parameters: "/F /T /IM PitlaneHQ.exe"; Flags: runhidden; RunOnceId: "CloseOldPitlaneHQ"

[UninstallDelete]
; everything TrackIQ created: the app folder, settings, profiles, sign-ins, logs and its browser data
Type: filesandordirs; Name: "{app}"
Type: filesandordirs; Name: "{userappdata}\PitlaneHQ"
Type: filesandordirs; Name: "{userappdata}\PitWall"
Type: filesandordirs; Name: "{localappdata}\PitlaneHQ"

[Code]
function RunEntryExists: Boolean;
begin
  Result := RegValueExists(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Run', 'PitlaneHQ');
end;

procedure InitializeWizard();
begin
  WizardForm.Position := poScreenCenter;
end;


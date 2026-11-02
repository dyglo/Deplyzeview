//! Windows' per-user credential vault survives shell/environment differences
//! and application-data cleanup. It contains only app access, never provider keys.
#[cfg(windows)]
const TARGET: &str = "com.deplyzeview.desktop.market-data";

#[cfg(windows)]
pub fn read() -> Option<Vec<u8>> {
    use windows_sys::Win32::Security::Credentials::{
        CredFree, CredReadW, CREDENTIALW, CRED_TYPE_GENERIC,
    };
    let name: Vec<u16> = TARGET.encode_utf16().chain(Some(0)).collect();
    let mut credential: *mut CREDENTIALW = std::ptr::null_mut();
    // The OS owns the result until CredFree; copy its blob before releasing it.
    unsafe {
        if CredReadW(name.as_ptr(), CRED_TYPE_GENERIC, 0, &mut credential) == 0
            || credential.is_null()
        {
            return None;
        }
        let item = &*credential;
        let bytes = if item.CredentialBlobSize > 0 && !item.CredentialBlob.is_null() {
            Some(
                std::slice::from_raw_parts(item.CredentialBlob, item.CredentialBlobSize as usize)
                    .to_vec(),
            )
        } else {
            None
        };
        CredFree(credential.cast());
        bytes
    }
}

#[cfg(windows)]
pub fn write(bytes: &[u8]) -> Result<(), String> {
    use windows_sys::Win32::Security::Credentials::{
        CredWriteW, CREDENTIALW, CRED_MAX_CREDENTIAL_BLOB_SIZE, CRED_PERSIST_LOCAL_MACHINE,
        CRED_TYPE_GENERIC,
    };
    if bytes.len() > CRED_MAX_CREDENTIAL_BLOB_SIZE as usize {
        return Err(
            "Application authorization is too large for the Windows credential vault".into(),
        );
    }
    let mut name: Vec<u16> = TARGET.encode_utf16().chain(Some(0)).collect();
    let mut user: Vec<u16> = "DeplyzeView".encode_utf16().chain(Some(0)).collect();
    let credential = CREDENTIALW {
        Type: CRED_TYPE_GENERIC,
        TargetName: name.as_mut_ptr(),
        UserName: user.as_mut_ptr(),
        CredentialBlobSize: bytes.len() as u32,
        CredentialBlob: bytes.as_ptr().cast_mut(),
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        ..Default::default()
    };
    // All input pointers remain live throughout this synchronous OS call.
    if unsafe { CredWriteW(&credential, 0) } == 0 {
        Err("Cannot save application access to the Windows credential vault".into())
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
pub fn read() -> Option<Vec<u8>> {
    None
}
#[cfg(not(windows))]
pub fn write(_: &[u8]) -> Result<(), String> {
    Err("Native vault unavailable; using per-user configuration".into())
}

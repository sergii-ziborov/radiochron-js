pub fn format_address(address: u64) -> String {
    let bytes = address.to_be_bytes();
    bytes[2..]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<Vec<_>>()
        .join(":")
}

pub fn classic_category(raw: u32) -> Option<&'static str> {
    let major = (raw >> 8) & 0x1f;
    let minor = (raw >> 2) & 0x3f;
    match major {
        1 => Some("Computer"),
        2 => Some("Phone"),
        4 => Some("Audio / video"),
        5 => match minor & 0x30 {
            0x10 => Some("Keyboard"),
            0x20 => Some("Mouse"),
            0x30 => Some("Keyboard + mouse"),
            _ => Some("Peripheral"),
        },
        6 => Some("Imaging"),
        7 => Some("Wearable"),
        8 => Some("Toy"),
        _ => None,
    }
}

pub fn le_category(raw: u16) -> Option<&'static str> {
    let category = raw >> 6;
    let subcategory = raw & 0x3f;
    match category {
        1 => Some("Phone"),
        2 => Some("Computer"),
        3 => Some("Watch"),
        6 => Some("Remote control"),
        8 => Some("Tag"),
        10 => Some("Media player"),
        12 => Some("Thermometer"),
        13 => Some("Heart-rate sensor"),
        15 => match subcategory {
            1 => Some("Keyboard"),
            2 => Some("Mouse"),
            3 => Some("Joystick"),
            4 => Some("Gamepad"),
            5 => Some("Digitizer"),
            7 => Some("Digital pen"),
            9 => Some("Touchpad"),
            _ => Some("Human interface device"),
        },
        17 => Some("Activity sensor"),
        18 => Some("Cycling sensor"),
        49 => Some("Pulse oximeter"),
        50 => Some("Weight scale"),
        _ => None,
    }
}

pub fn privacy_id(raw_id: &str) -> String {
    let hash = raw_id
        .as_bytes()
        .iter()
        .fold(0xcbf29ce484222325_u64, |hash, byte| {
            (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
        });
    format!("windows:{hash:016x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_bluetooth_address_as_six_octets() {
        assert_eq!(format_address(0x0000_e990_d723_ca69), "e9:90:d7:23:ca:69");
    }

    #[test]
    fn recognizes_classic_mouse_and_keyboard_classes() {
        assert_eq!(classic_category((5 << 8) | (0x20 << 2)), Some("Mouse"));
        assert_eq!(classic_category((5 << 8) | (0x10 << 2)), Some("Keyboard"));
    }

    #[test]
    fn recognizes_le_hid_appearance() {
        assert_eq!(le_category((15 << 6) | 2), Some("Mouse"));
        assert_eq!(le_category((15 << 6) | 1), Some("Keyboard"));
    }
}

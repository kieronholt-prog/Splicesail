import Toybox.Application;
import Toybox.Lang;

//! Feature tier — controls which screens are available (Core / Pro / Pro+).
module DisplayTier {
    const CORE = 0;
    const PRO = 1;
    const PRO_PLUS = 2;

    function fromString(name as String) as Number {
        if (name.equals("pro_plus") || name.equals("proPlus")) {
            return PRO_PLUS;
        }
        if (name.equals("pro")) {
            return PRO;
        }
        return CORE;
    }

    function toWireName(tier as Number) as String {
        if (tier == PRO_PLUS) {
            return "pro_plus";
        }
        if (tier == PRO) {
            return "pro";
        }
        return "core";
    }

    function loadFromProperties() as Number {
        var value = Application.Properties.getValue("displayTier");
        if (value == null) {
            return CORE;
        }
        var tier = value as Number;
        if (tier < CORE) {
            return CORE;
        }
        if (tier > PRO_PLUS) {
            return PRO_PLUS;
        }
        return tier;
    }

    function saveToProperties(tier as Number) as Void {
        Application.Properties.setValue("displayTier", tier);
    }

    function allowsSog(tier as Number) as Boolean {
        return tier >= PRO;
    }

    function allowsVmg(tier as Number) as Boolean {
        return tier >= PRO_PLUS;
    }

    function label(tier as Number) as String {
        if (tier == PRO_PLUS) {
            return "Pro+";
        }
        if (tier == PRO) {
            return "Pro";
        }
        return "Core";
    }
}

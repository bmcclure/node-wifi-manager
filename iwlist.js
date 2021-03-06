var exec    = require("child_process").exec;

/*****************************************************************************\
    Return a function which is responsible for using "iwlist scan" to figure
    out the list of visible SSIDs along with their RSSI (and other info)
\*****************************************************************************/
module.exports = function(callback) {
    var fields_to_extract = {
        "ssid": /ESSID:\"(.*)\"/,
        "signal_strength": /.*Signal level=(-\d+)/,
        "encrypted":       /Encryption key:(on)/,
        "open":            /Encryption key:(off)/,
    };

    exec("iwlist scan", function(error, stdout, stderr) {
        // Handle errors from running "iwlist scan"
        if (error) {
            return callback(error, output)
        }

        /* The output structure looks like this:
        [
            {
                interface: "wlan0",
                scan_results: [
                    { ssid: "WifiB", address: "...", "signal_strength": 57 },
                    { ssid: "WifiA", address: "...", "signal_strength": 35 }
                ]
            },
            ...
        ] */
        var output          = [],
            interface_entry = null,
            current_cell    = null;

        function append_previous_cell() {
            if (current_cell != null && interface_entry != null) {
                if (typeof(current_cell["ssid"]) != "undefined" &&
                    current_cell["ssid"] != "" ) {
                    interface_entry["scan_results"].push(current_cell);
                }
                current_cell = null;
            }
        }

        function append_previous_interface() {
            append_previous_cell();
            if (interface_entry != null) {
                output.push(interface_entry);
                interface_entry = null;
            }
        }

        // Parse the result, build return object
        lines = stdout.split("\n");
        for (var idx in lines) {
            line = lines[idx].trim();

            // Detect new interface
            var re_new_interface = line.match(/([^\s]+)\s+Scan completed :/);
            if (re_new_interface) {
                console.log("Found new interface: " + re_new_interface[1]);
                append_previous_interface();
                interface_entry = {
                    "interface":    re_new_interface[1],
                    "scan_results": []
                };
                continue;
            }

            // Detect new cell
            var re_new_cell = line.match(/Cell ([0-9]+) - Address: (.*)/);
            if (re_new_cell) {
                append_previous_cell();
                current_cell = {
                    "cell_id": parseInt(re_new_cell[1]),
                    "address": re_new_cell[2],
                };
                continue;
            }

            var match_frequency = line.match(/Frequency:(.+)\s+GHz/);
            if (match_frequency) {
                current_cell.frequency = Math.floor(parseFloat(match_frequency[1]) * 10) / 10;
            }

            var match_quality = line.match(/Quality=(\d+)\/70/);
            if (match_quality) {
                var quality = match_quality[1];
                quality = Math.round(quality / 70 * 100);
                current_cell.quality = quality.toString();
            }

            // Handle other fields we want to extract
            for (var key in fields_to_extract) {
                var match = line.match(fields_to_extract[key]);
                if (match) {
                    current_cell[key] = match[1];
                }
            }
        }

        // Add the last item we tracked
        append_previous_interface();

        for (var key in output) {
            output[key].scan_results.sort(function (a, b) {
                a_quality = parseInt(a.quality);
                b_quality = parseInt(b.quality);
                if (a_quality < b_quality)
                    return 1;
                if (a_quality > b_quality)
                    return -1;
                return 0;
            });
        }

        return callback(null, output);
    });
}

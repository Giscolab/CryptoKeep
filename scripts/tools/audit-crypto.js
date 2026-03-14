(function(){
    'use strict';

    // Base64 string to Uint8Array
    function base64ToBytes(b64) {
        let binary = atob(b64);
        let len = binary.length;
        let bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    // Compute Shannon entropy (bits per byte) for a byte array
    function computeEntropy(bytes) {
        if (!bytes || bytes.length === 0) {
            return 0;
        }
        let freq = new Map();
        for (let b of bytes) {
            freq.set(b, (freq.get(b) || 0) + 1);
        }
        let n = bytes.length;
        let entropy = 0;
        for (let count of freq.values()) {
            let p = count / n;
            entropy -= p * Math.log2(p);
        }
        return entropy;
    }

    // Estimate brute-force cracking time for a password (with given PBKDF2 iterations)
    function estimateBruteforceTimes(password, iterations) {
        // Determine character set size based on character types in password
        let hasLower = false, hasUpper = false, hasDigit = false, hasSymbol = false;
        for (let ch of password) {
            if (/[a-z]/.test(ch)) hasLower = true;
            else if (/[A-Z]/.test(ch)) hasUpper = true;
            else if (/[0-9]/.test(ch)) hasDigit = true;
            else hasSymbol = true;
        }
        let charsetSize = 0;
        if (hasLower) charsetSize += 26;
        if (hasUpper) charsetSize += 26;
        if (hasDigit) charsetSize += 10;
        if (hasSymbol) charsetSize += 33;  // printable symbols (including space)
        if (charsetSize === 0) charsetSize = 1;  // fallback for empty password or undefined charset

        let length = password.length;
        // Calculate total combinations = charsetSize^length (use BigInt to handle large values)
        let totalCombos = BigInt(charsetSize) ** BigInt(length);
        // Calculate entropy in bits
        let entropyBits;
        if (totalCombos < BigInt(Number.MAX_SAFE_INTEGER)) {
            entropyBits = Math.log2(Number(totalCombos));
        } else {
            entropyBits = length * Math.log2(charsetSize);
        }

        // Measure local PBKDF2 performance to estimate attempts per second
        return new Promise(resolve => {
            let t0 = performance.now();
            crypto.subtle.importKey(
                "raw", new TextEncoder().encode(password || ""), { name: "PBKDF2" }, false, ["deriveBits"]
            ).then(key => {
                return crypto.subtle.deriveBits(
                    { name: "PBKDF2", salt: new Uint8Array([0,1,2,3,4,5,6,7]), iterations: iterations, hash: "SHA-512" },
                    key,
                    256
                );
            }).then(() => {
                let t1 = performance.now();
                let durationMs = t1 - t0;
                if (durationMs <= 0) durationMs = 1;
                // Approximate local CPU attempts per second
                let localRate = 1000 / durationMs;
                // Assumed rates for GPU and cluster (hypothetical)
                let gpuRate = 10000;
                let clusterRate = 10000000;

                // Helper to format seconds into human-readable time
                function formatTime(seconds) {
                    if (!isFinite(seconds)) return "Infinite";
                    let sec = seconds;
                    if (sec < 1) return sec.toFixed(2) + " seconds";
                    let units = [
                        { name: "year", secs: 31536000 },
                        { name: "day", secs: 86400 },
                        { name: "hour", secs: 3600 },
                        { name: "minute", secs: 60 },
                        { name: "second", secs: 1 }
                    ];
                    let result = "";
                    for (let u of units) {
                        if (sec >= u.secs) {
                            let qty = Math.floor(sec / u.secs);
                            sec -= qty * u.secs;
                            result += qty + " " + u.name + (qty > 1 ? "s" : "");
                            break;
                        }
                    }
                    return result || "0 seconds";
                }

                // Calculate cracking time in seconds for each scenario
                let localPerSec = Math.floor(localRate);
                if (localPerSec < 1) localPerSec = 1;
                let secondsLocal = totalCombos / BigInt(localPerSec);
                let secondsGPU = totalCombos / BigInt(gpuRate);
                let secondsCluster = totalCombos / BigInt(clusterRate);
                // Convert BigInt times to number (cap at Infinity if too large)
                let timeLocalSec = (secondsLocal > BigInt(Number.MAX_SAFE_INTEGER)) ? Infinity : Number(secondsLocal);
                let timeGPUSec = (secondsGPU > BigInt(Number.MAX_SAFE_INTEGER)) ? Infinity : Number(secondsGPU);
                let timeClusterSec = (secondsCluster > BigInt(Number.MAX_SAFE_INTEGER)) ? Infinity : Number(secondsCluster);
                // Format times
                let timeLocalStr = formatTime(timeLocalSec);
                let timeGPUStr = formatTime(timeGPUSec);
                let timeClusterStr = formatTime(timeClusterSec);

                // Determine qualitative strength rating
                let strength;
                if (entropyBits >= 80) strength = "VERY STRONG";
                else if (entropyBits >= 60) strength = "STRONG";
                else if (entropyBits >= 50) strength = "MEDIUM";
                else if (entropyBits >= 40) strength = "WEAK";
                else strength = "VERY WEAK";

                resolve({
                    entropyBits: entropyBits,
                    crackTime: { local: timeLocalStr, gpu: timeGPUStr, cluster: timeClusterStr },
                    rating: strength,
                    assumptions: { localRate: Math.floor(localRate), gpuRate: gpuRate, clusterRate: clusterRate }
                });
            }).catch(err => {
                console.error("PBKDF2 timing failed:", err);
                resolve(null);
            });
        });
    }

    // Fetch all records from IndexedDB (entries and metadata)
    function fetchAllEntriesFromDB() {
        return new Promise((resolve, reject) => {
            const dbNames = ["VaultPersonal", "vault", "VaultDB", "vault-personal", "vaultPersonal"];
            let tried = 0;
            function tryNext() {
                if (tried >= dbNames.length) return reject(new Error("Database not found"));
                let name = dbNames[tried++];
                let openReq = indexedDB.open(name);
                let createdNew = false;
                openReq.onupgradeneeded = function() {
                    createdNew = true;
                    this.transaction.abort();
                };
                openReq.onsuccess = function() {
                    let db = openReq.result;
                    if (createdNew || !db.objectStoreNames.length) {
                        // Wrong database (newly created or empty) - discard and try next
                        db.close();
                        indexedDB.deleteDatabase(name);
                        tryNext();
                    } else {
                        // Correct database found
                        let resultEntries = [];
                        let tx = db.transaction(db.objectStoreNames, "readonly");
                        tx.oncomplete = function() {
                            db.close();
                            resolve({ dbName: name, entries: resultEntries });
                        };
                        tx.onerror = function(e) {
                            console.error("DB transaction error:", e);
                            reject(new Error("Failed to read database"));
                        };
                        for (let i = 0; i < db.objectStoreNames.length; i++) {
                            let storeName = db.objectStoreNames[i];
                            let store = tx.objectStore(storeName);
                            let getAllReq = store.getAll();
                            getAllReq.onsuccess = function(e) {
                                let records = e.target.result;
                                if (records && records.length) {
                                    let first = records[0];
                                    if (first.iv && first.ciphertext) {
                                        // This store contains encrypted entries
                                        records.forEach(rec => {
                                            resultEntries.push(Object.assign({ store: storeName }, rec));
                                        });
                                    } else {
                                        // Likely metadata store (salt, iterations, etc.)
                                        records.forEach(rec => {
                                            if (rec.salt !== undefined || rec.iterations !== undefined || rec.key !== undefined) {
                                                resultEntries.push(Object.assign({ store: storeName, __meta: true }, rec));
                                            }
                                        });
                                    }
                                }
                            };
                        }
                    }
                };
                openReq.onerror = function() {
                    tryNext();
                };
            }
            tryNext();
        });
    }

    // Extract salt and iteration count from fetched records
    function extractSaltAndIterations(records) {
        let salt = null;
        let iterations = null;
        for (let rec of records) {
            if (rec.__meta) {
                // Metadata record
                if (rec.salt !== undefined) salt = rec.salt;
                if (rec.iterations !== undefined) iterations = rec.iterations;
                if (rec.key && rec.value !== undefined) {
                    let keyName = ('' + rec.key).toLowerCase();
                    if (keyName === 'salt') salt = rec.value;
                    if (keyName.includes('iter')) iterations = rec.value;
                }
            } else {
                // Entry record might directly contain salt/iterations (unlikely, but just in case)
                if (rec.salt !== undefined) salt = rec.salt;
                if (rec.iterations !== undefined) iterations = rec.iterations;
            }
        }
        if (iterations == null) {
            iterations = 150000;  // default if not specified
        }
        return { salt, iterations };
    }

    // Main audit function
    async function runAudit(masterPassword, callback) {
        let report = {
            ivDuplicates: [],
            entropyAnalysis: { averageBitsPerByte: null, minBitsPerByte: null, minEntropyEntryId: null },
            masterPasswordStrength: null,
            saltReuse: { saltHex: null, saltBytesLength: null, reused: false },
            pbkdf2CollisionTest: {
                identicalPasswordKeysMatch: true,
                differentPasswordKeysMatch: false,
                sampleKeysHex: {}
            }
        };

        // Fetch data from IndexedDB
        let dbData;
        try {
            dbData = await fetchAllEntriesFromDB();
        } catch (err) {
            console.error("Error fetching entries from IndexedDB:", err);
            dbData = { entries: [] };
        }
        let entries = dbData.entries || [];
        // Separate encrypted entries and metadata records
        let entryRecords = entries.filter(rec => !rec.__meta);
        let metaRecords = entries.filter(rec => rec.__meta);
        // Get salt and iterations
        let { salt, iterations } = extractSaltAndIterations(entries);

        // 1. Check IV uniqueness
        let ivMap = new Map();
        for (let entry of entryRecords) {
            if (!entry.iv) continue;
            let ivStr = entry.iv;
            if (!ivMap.has(ivStr)) ivMap.set(ivStr, []);
            // Identify entry (use id, key, or index as identifier)
            let idLabel = (entry.id !== undefined ? entry.id : (entry.key !== undefined ? entry.key : entryRecords.indexOf(entry)));
            ivMap.get(ivStr).push(idLabel);
        }
        for (let [ivStr, ids] of ivMap.entries()) {
            if (ids.length > 1) {
                report.ivDuplicates.push({ iv: ivStr, entries: ids });
            }
        }

        // 2. Analyze ciphertext entropy
        let entropies = [];
        for (let entry of entryRecords) {
            if (!entry.ciphertext) continue;
            try {
                let ciphertextBytes = base64ToBytes(entry.ciphertext);
                let H = computeEntropy(ciphertextBytes);
                entropies.push({ id: (entry.id !== undefined ? entry.id : entryRecords.indexOf(entry)), entropy: H });
            } catch (e) {
                console.warn("Entropy computation failed for entry:", e);
            }
        }
        if (entropies.length > 0) {
            let totalEntropy = entropies.reduce((sum, e) => sum + e.entropy, 0);
            let avgEntropy = totalEntropy / entropies.length;
            let minEntry = entropies.reduce((min, e) => e.entropy < min.entropy ? e : min, entropies[0]);
            report.entropyAnalysis.averageBitsPerByte = avgEntropy;
            report.entropyAnalysis.minBitsPerByte = minEntry.entropy;
            report.entropyAnalysis.minEntropyEntryId = minEntry.id;
        }

        // 3. Evaluate master password strength (if provided)
        if (masterPassword) {
            report.masterPasswordStrength = await estimateBruteforceTimes(masterPassword, iterations);
        }

        // 4. Detect salt reuse
        if (salt) {
            // Convert salt to bytes and hex
            let saltBytes;
            if (typeof salt === "string") {
                try { saltBytes = base64ToBytes(salt); }
                catch(e) { saltBytes = new TextEncoder().encode(salt); }
            } else if (salt instanceof Uint8Array) {
                saltBytes = salt;
            } else if (salt instanceof ArrayBuffer) {
                saltBytes = new Uint8Array(salt);
            } else {
                saltBytes = new TextEncoder().encode(String(salt));
            }
            report.saltReuse.saltBytesLength = saltBytes.length;
            report.saltReuse.saltHex = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');
            // Check if more than one distinct salt found (across meta records)
            let saltSet = new Set();
            metaRecords.forEach(m => {
                if (m.salt !== undefined) saltSet.add(m.salt);
                if (m.key && m.value !== undefined && ('' + m.key).toLowerCase().includes('salt')) {
                    saltSet.add(m.value);
                }
            });
            report.saltReuse.reused = (saltSet.size > 1);
        }

        // 5. Simulate PBKDF2 collisions with reused salt
        if (salt) {
            let saltBytes;
            if (typeof salt === "string") {
                try { saltBytes = base64ToBytes(salt); }
                catch(e) { saltBytes = new TextEncoder().encode(salt); }
            } else if (salt instanceof Uint8Array) {
                saltBytes = salt;
            } else if (salt instanceof ArrayBuffer) {
                saltBytes = new Uint8Array(salt);
            } else {
                saltBytes = new TextEncoder().encode(String(salt));
            }
            // Dummy passwords for testing
            let dummy1 = "P@ssw0rd";
            let dummy2 = "Password123";
            try {
                // Derive keys for dummy passwords with the same salt
                let keyMat1 = await crypto.subtle.importKey("raw", new TextEncoder().encode(dummy1), { name: "PBKDF2" }, false, ["deriveBits"]);
                let keyMat2 = await crypto.subtle.importKey("raw", new TextEncoder().encode(dummy2), { name: "PBKDF2" }, false, ["deriveBits"]);
                let derived1a = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: saltBytes, iterations: iterations, hash: "SHA-512" }, keyMat1, 256);
                let derived1b = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: saltBytes, iterations: iterations, hash: "SHA-512" }, keyMat1, 256);
                let derived2  = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: saltBytes, iterations: iterations, hash: "SHA-512" }, keyMat2, 256);
                let key1a = new Uint8Array(derived1a);
                let key1b = new Uint8Array(derived1b);
                let key2  = new Uint8Array(derived2);
                // Check if identical input produced identical outputs
                report.pbkdf2CollisionTest.identicalPasswordKeysMatch = (key1a.length === key1b.length && key1a.every((b,i) => b === key1b[i]));
                report.pbkdf2CollisionTest.differentPasswordKeysMatch = (key1a.length === key2.length && key1a.every((b,i) => b === key2[i]));
                // Store sample key prefixes in hex for demonstration
                function toHex(arr, bytes = 8) {
                    return Array.from(arr.slice(0, bytes)).map(b => b.toString(16).padStart(2,'0')).join('');
                }
                report.pbkdf2CollisionTest.sampleKeysHex[dummy1] = toHex(key1a);
                report.pbkdf2CollisionTest.sampleKeysHex[dummy2] = toHex(key2);
            } catch (e) {
                console.error("PBKDF2 collision simulation failed:", e);
            }
        }

        // Log structured report to console
        console.log("=== Vault Personal Cryptographic Audit Report ===");
        // IV uniqueness results
        if (report.ivDuplicates.length === 0) {
            console.log("1. IV Uniqueness: PASS - All IVs are unique across encrypted entries.");
        } else {
            console.warn("1. IV Uniqueness: FAIL - Duplicate IVs found!");
            report.ivDuplicates.forEach(group => {
                console.warn(`   Duplicate IV ${group.iv} used by entries: ${group.entries.join(', ')}`);
            });
        }
        // Entropy analysis results
        if (report.entropyAnalysis.averageBitsPerByte !== null) {
            let avg = report.entropyAnalysis.averageBitsPerByte;
            let min = report.entropyAnalysis.minBitsPerByte;
            let minId = report.entropyAnalysis.minEntropyEntryId;
            console.log(`2. Ciphertext Entropy: Average = ${avg.toFixed(2)} bits/byte, Minimum = ${min.toFixed(2)} bits/byte (entry ${minId}).`);
            if (min < 6) {
                console.warn("   [!] Low entropy detected for an entry! This could indicate non-random ciphertext or encryption issues.");
            } else {
                console.log("   All ciphertexts appear random with no obvious patterns.");
            }
        } else {
            console.log("2. Ciphertext Entropy: No encrypted entries to analyze.");
        }
        // Master password strength results
        if (report.masterPasswordStrength) {
            let mps = report.masterPasswordStrength;
            console.log(`3. Master Password Strength: ~${mps.entropyBits.toFixed(1)} bits of entropy -> ${mps.rating}.`);
            console.log(`   Estimated brute-force time: Local ~ ${mps.crackTime.local}, GPU ~ ${mps.crackTime.gpu}, Cluster ~ ${mps.crackTime.cluster}.`);
        } else {
            console.log("3. Master Password Strength: (Master password not provided for analysis)");
        }
        // Salt reuse results
        if (report.saltReuse.saltBytesLength !== null) {
            if (report.saltReuse.reused) {
                console.warn("4. Salt Reuse: FAIL - Multiple salt values detected! Each context should use a unique salt.");
            } else {
                console.log("4. Salt Reuse: PASS - No salt reuse detected (salt is unique).");
            }
            console.log(`   Salt length: ${report.saltReuse.saltBytesLength} bytes (hex: ${report.saltReuse.saltHex}).`);
            if (report.saltReuse.saltBytesLength < 16) {
                console.warn("   [!] Salt length is less than 16 bytes - consider using a longer salt for better security.");
            }
        } else {
            console.log("4. Salt Reuse: Salt not found or not applicable.");
        }
        // PBKDF2 collision simulation results
        console.log("5. PBKDF2 Collision Simulation (with reused salt):");
        if (salt) {
            let test = report.pbkdf2CollisionTest;
            let d1 = "P@ssw0rd", d2 = "Password123";
            if (test.identicalPasswordKeysMatch) {
                console.log(`   - Same password "${d1}" derived twice -> keys match (expected) [${test.sampleKeysHex[d1]}...]`);
            } else {
                console.warn(`   - Same password "${d1}" derived twice -> keys did NOT match (unexpected!)`);
            }
            if (test.differentPasswordKeysMatch) {
                console.warn(`   - Different passwords "${d1}" vs "${d2}" produced the SAME key! (Collision found - highly unlikely)`);
            } else {
                console.log(`   - Different passwords "${d1}" vs "${d2}" -> keys differ (no collision).`);
            }
            console.log("   (Identical inputs with the same salt yield identical keys, illustrating why unique salts per entry/user are critical.)");
        } else {
            console.log("   (Salt not available, collision test skipped.)");
        }
        console.log("=== End of Audit Report ===");

        // Invoke callback with report (for UI integration) if provided
        if (typeof callback === 'function') {
            callback(report);
        }
        return report;
    }

    // Expose module
    window.AuditCrypto = { runAudit };
})();

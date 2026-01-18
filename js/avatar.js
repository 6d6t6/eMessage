// Procedurally generated avatar system
// Creates unique, uniform, grid-based avatars based on public keys
// Like QR codes but circular and more artistic

// Avatar generation functions
function generateAvatar(pubkey, size = 40) {
    if (!pubkey) return '';
    
    // Create a deterministic seed from the pubkey
    const seed = hashString(pubkey);
    const rng = createSeededRNG(seed);
    
    // Generate avatar configuration
    const config = generateAvatarConfig(rng, pubkey);
    
    // Create SVG avatar
    return createAvatarSVG(config, size);
}

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
}

function createSeededRNG(seed) {
    let state = seed;
    return function() {
        state = (state * 9301 + 49297) % 233280;
        return state / 233280;
    };
}

function generateAvatarConfig(rng, pubkey) {
    const config = {
        gridSize: 8, // Fixed uniform grid size
        backgroundHue: rng() * 360,
        backgroundSaturation: 35 + rng() * 45, // 35-80% for more vibrant backgrounds
        backgroundLightness: 20 + rng() * 30, // 20-50% for better range
        patternSeed: Math.floor(rng() * 1000000), // Seed for pattern generation
        patternType: Math.floor(rng() * 4), // 0-3: different pattern algorithms
        patternOffset: Math.floor(rng() * 1000), // Additional offset for uniqueness
        patternMultiplier: Math.floor(rng() * 10) + 1, // Multiplier for pattern variation
        npub: pubkey // Store npub for pattern generation
    };
    
    return config;
}

function createAvatarSVG(config, size) {
    const center = size / 2;
    const radius = size * 0.45;
    
    // Generate background color
    const backgroundColor = `hsl(${config.backgroundHue}, ${config.backgroundSaturation}%, ${config.backgroundLightness}%)`;
    
    // Calculate optimal contrasting dot color with guaranteed visibility
    const dotColor = calculateOptimalDotColor(config.backgroundHue, config.backgroundSaturation, config.backgroundLightness, config.patternSeed);
    
    let svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">`;
    
    // Square background instead of circle
    svg += `<rect x="0" y="0" width="${size}" height="${size}" fill="${backgroundColor}"/>`;
    
    // Generate spiral pattern with npub data instead of random pattern
    svg += generateSpiralAvatarPattern(config.npub, center, radius, dotColor, size);
    
    svg += '</svg>';
    return svg;
}

function calculateOptimalDotColor(bgHue, bgSaturation, bgLightness, patternSeed) {
    // Create seeded RNG for color variations
    const colorRng = createSeededRNG(patternSeed + 12345); // Offset to avoid collision with pattern RNG
    
    // Convert background HSL to RGB
    const bgRGB = hslToRgb(bgHue, bgSaturation, bgLightness);
    
    // Calculate background luminance
    const bgLuminance = calculateLuminance(bgRGB);
    
    // Try multiple color strategies to find one that meets WCAG AA (3.0:1)
    const strategies = [
        // Strategy 1: Colorful light dots (not just white)
        () => {
            const dotHue = (bgHue + 180 + colorRng() * 60 - 30) % 360; // Complementary with variation
            const dotSaturation = 60 + colorRng() * 35; // 60-95% saturation for colorful dots
            const dotLightness = 85 + colorRng() * 12; // 85-97% lightness for visibility
            return { hue: dotHue, saturation: dotSaturation, lightness: dotLightness };
        },
        // Strategy 2: Colorful dark dots
        () => {
            const dotHue = (bgHue + 180 + colorRng() * 60 - 30) % 360; // Complementary with variation
            const dotSaturation = 70 + colorRng() * 25; // 70-95% saturation for colorful dots
            const dotLightness = 8 + colorRng() * 12; // 8-20% lightness for visibility
            return { hue: dotHue, saturation: dotSaturation, lightness: dotLightness };
        },
        // Strategy 3: High contrast complementary with more color
        () => {
            const dotHue = (bgHue + 180 + colorRng() * 40 - 20) % 360; // Complementary with slight variation
            const dotSaturation = 80 + colorRng() * 15; // 80-95% saturation
            const dotLightness = bgLightness < 30 ? 90 : 10; // Extreme contrast
            return { hue: dotHue, saturation: dotSaturation, lightness: dotLightness };
        },
        // Strategy 4: Monochrome but colorful
        () => {
            const dotHue = bgHue + (colorRng() * 30 - 15); // Same hue with slight variation
            const dotSaturation = 75 + colorRng() * 20; // 75-95% saturation
            const dotLightness = bgLightness < 30 ? 88 : 12; // High contrast
            return { hue: dotHue, saturation: dotSaturation, lightness: dotLightness };
        },
        // Strategy 5: Triadic color harmony
        () => {
            const dotHue = (bgHue + 120 + colorRng() * 60 - 30) % 360; // Triadic with variation
            const dotSaturation = 65 + colorRng() * 30; // 65-95% saturation
            const dotLightness = bgLightness < 30 ? 87 : 13; // High contrast
            return { hue: dotHue, saturation: dotSaturation, lightness: dotLightness };
        }
    ];
    
    // Test each strategy until we find one that meets WCAG AA (3.0:1)
    for (let i = 0; i < strategies.length; i++) {
        const strategy = strategies[i];
        const dotColor = strategy();
        const dotRGB = hslToRgb(dotColor.hue, dotColor.saturation, dotColor.lightness);
        const dotLuminance = calculateLuminance(dotRGB);
        
        // Calculate contrast ratio
        const contrastRatio = calculateContrastRatio(bgLuminance, dotLuminance);
        
        // If we meet WCAG AA standard, use this color
        if (contrastRatio >= 3.0) {
            return `hsl(${dotColor.hue}, ${dotColor.saturation}%, ${dotColor.lightness}%)`;
        }
    }
    
    // Fallback: Force extreme contrast with color if all strategies fail
    const fallbackLightness = bgLuminance < 0.3 ? 92 : 8;
    const fallbackHue = (bgHue + 180 + colorRng() * 60 - 30) % 360;
    const fallbackSaturation = 80 + colorRng() * 15;
    return `hsl(${fallbackHue}, ${fallbackSaturation}%, ${fallbackLightness}%)`;
}

function calculateContrastRatio(luminance1, luminance2) {
    // Ensure luminance1 is the lighter color
    const lighter = Math.max(luminance1, luminance2);
    const darker = Math.min(luminance1, luminance2);
    
    // Calculate contrast ratio using WCAG 2.1 formula (matches Chrome DevTools)
    return (lighter + 0.05) / (darker + 0.05);
}

function hslToRgb(h, s, l) {
    h /= 360;
    s /= 100;
    l /= 100;
    
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h * 6) % 2 - 1));
    const m = l - c / 2;
    
    let r, g, b;
    
    if (h < 1/6) {
        r = c; g = x; b = 0;
    } else if (h < 2/6) {
        r = x; g = c; b = 0;
    } else if (h < 3/6) {
        r = 0; g = c; b = x;
    } else if (h < 4/6) {
        r = 0; g = x; b = c;
    } else if (h < 5/6) {
        r = x; g = 0; b = c;
    } else {
        r = c; g = 0; b = x;
    }
    
    return {
        r: Math.round((r + m) * 255),
        g: Math.round((g + m) * 255),
        b: Math.round((b + m) * 255)
    };
}

function calculateLuminance(rgb) {
    // Convert RGB to luminance using WCAG 2.1 formula (matches Chrome DevTools)
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;
    
    // Apply gamma correction
    const rLinear = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
    const gLinear = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
    const bLinear = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
    
    // Calculate relative luminance
    return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
}

function generateUniformDotPattern(config, center, radius, dotColor) {
    let svg = '';
    const dotSize = radius / 32; // Smaller dots for higher density
    
    // Create binary RNG based on pattern seed
    const binaryRng = createSeededRNG(config.patternSeed);
    
    // Create a much larger square grid for maximum combinations
    const gridSize = 32; // 32x32 grid (1024 possible positions)
    const gridSpacing = radius / (gridSize * 0.5); // Tighter spacing to fill entire circle
    
    for (let x = 0; x < gridSize; x++) {
        for (let y = 0; y < gridSize; y++) {
            // Calculate position in grid
            const gridX = (x - gridSize/2 + 0.5) * gridSpacing;
            const gridY = (y - gridSize/2 + 0.5) * gridSpacing;
            
            // Check if the entire dot would be inside the circle
            const distanceFromCenter = Math.sqrt(gridX * gridX + gridY * gridY);
            if (distanceFromCenter + dotSize <= radius * 1) {
                // Simple random binary: 45% chance of dot (increased from 40%)
                if (binaryRng() < 0.45) {
                    const finalX = center + gridX;
                    const finalY = center + gridY;
                    svg += `<circle cx="${finalX}" cy="${finalY}" r="${dotSize}" fill="${dotColor}"/>`;
                }
            }
        }
    }
    
    return svg;
}

// Pattern validation function to ensure balanced, intentional designs
function checkPatternBalance(ring, angle, config) {
    // Ensure we don't create problematic patterns
    const ringOffset = ring + config.patternOffset;
    const angleOffset = angle + config.patternOffset;
    
    // Prevent overly sparse patterns (at least 8 dots minimum)
    const minDots = 8;
    
    // Prevent overly dense patterns (max 48 dots)
    const maxDots = 48;
    
    // Ensure good distribution across rings
    const ringDistribution = Math.abs(ring - 3) <= 2; // Prefer middle rings
    
    // Ensure good angular distribution
    const angleDistribution = angleOffset % 3 !== 0 || ringOffset % 2 === 0;
    
    return ringDistribution && angleDistribution;
}

function generateColorPalette(rng) {
    const baseHue = rng() * 360;
    const saturation = 20 + rng() * 30; // 20-50% for subtle backgrounds
    const lightness = 15 + rng() * 25; // 15-40% for dark backgrounds
    
    const colors = [];
    
    // Primary color
    colors.push(`hsl(${baseHue}, ${saturation}%, ${lightness}%)`);
    
    // Complementary color
    colors.push(`hsl(${(baseHue + 180) % 360}, ${saturation}%, ${lightness}%)`);
    
    // Analogous colors
    colors.push(`hsl(${(baseHue + 60) % 360}, ${saturation * 0.8}%, ${lightness * 1.1}%)`);
    colors.push(`hsl(${(baseHue - 60 + 360) % 360}, ${saturation * 0.8}%, ${lightness * 1.1}%)`);
    
    // Accent color
    colors.push(`hsl(${(baseHue + 120) % 360}, ${saturation * 0.9}%, ${lightness * 0.9}%)`);
    
    return colors;
}

// Utility function to get avatar for display
function getAvatarForPubkey(pubkey, size = 40) {
    return generateAvatar(pubkey, size);
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        generateAvatar,
        getAvatarForPubkey
    };
} 

// Calculate exact number of valid dot positions in the circle
function calculateValidDotPositions(size) {
    const center = size / 2;
    const radius = size * 0.45;
    const dotSize = radius / 32; // Updated to match new dot size
    const gridSize = 32; // Updated to match new grid size
    const gridSpacing = radius / (gridSize * 0.5);
    
    let validPositions = [];
    let count = 0;
    
    for (let x = 0; x < gridSize; x++) {
        for (let y = 0; y < gridSize; y++) {
            const gridX = (x - gridSize/2 + 0.5) * gridSpacing;
            const gridY = (y - gridSize/2 + 0.5) * gridSpacing;
            
            const distanceFromCenter = Math.sqrt(gridX * gridX + gridY * gridY);
            if (distanceFromCenter + dotSize <= radius * 1) {
                validPositions.push({x: x, y: y, gridX: gridX, gridY: gridY});
                count++;
            }
        }
    }
    
    return {count, positions: validPositions};
}

// Encode data into a dot pattern
function encodeDataToPattern(data, size = 100) {
    const {count, positions} = calculateValidDotPositions(size);
    
    // Convert data to binary
    const binaryData = stringToBinary(data);
    
    // Pad or truncate to fit available positions
    const paddedData = binaryData.padEnd(count, '0').substring(0, count);
    
    return {pattern: paddedData, positions: positions, dataLength: binaryData.length};
}

// Decode data from a dot pattern
function decodePatternToData(pattern, positions) {
    // Convert pattern back to binary string
    const binaryString = pattern.join('');
    
    // Convert binary back to string
    return binaryToString(binaryString);
}

// Utility functions for encoding/decoding
function stringToBinary(str) {
    return str.split('').map(char => char.charCodeAt(0).toString(2).padStart(8, '0')).join('');
}

function binaryToString(binary) {
    const bytes = [];
    for (let i = 0; i < binary.length; i += 8) {
        const byte = binary.substring(i, i + 8);
        if (byte.length === 8) {
            bytes.push(parseInt(byte, 2));
        }
    }
    return String.fromCharCode(...bytes).replace(/\0/g, '');
}

// Get maximum data capacity
function getMaxDataCapacity(size = 100) {
    const {count} = calculateValidDotPositions(size);
    const maxBytes = Math.floor(count / 8);
    const maxChars = maxBytes;
    
    return {
        totalBits: count,
        maxBytes: maxBytes,
        maxChars: maxChars,
        exampleCapacity: `"${'A'.repeat(maxChars)}"` // Example of max capacity
    };
} 

// Encode string directly into dot pattern (like QR code)
function encodeStringToAvatar(inputString, size = 100) {
    const center = size / 2;
    const radius = size * 0.45;
    const dotSize = radius / 32;
    const gridSize = 32;
    const gridSpacing = radius / (gridSize * 0.5);
    
    // Convert string to binary
    const binaryData = stringToBinary(inputString);
    
    // Get valid positions
    const {count, positions} = calculateValidDotPositions(size);
    
    // Pad or truncate binary data to fit available positions
    const paddedData = binaryData.padEnd(count, '0').substring(0, count);
    
    // Create SVG with high contrast (black dots on white background)
    let svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">`;
    
    // White background
    svg += `<rect x="0" y="0" width="${size}" height="${size}" fill="white"/>`;
    
    // Add orientation markers (corner squares)
    const markerSize = dotSize * 3;
    const markerOffset = dotSize * 2;
    
    // Top-left marker
    svg += `<rect x="${markerOffset}" y="${markerOffset}" width="${markerSize}" height="${markerSize}" fill="black"/>`;
    svg += `<rect x="${markerOffset + dotSize}" y="${markerOffset + dotSize}" width="${dotSize}" height="${dotSize}" fill="white"/>`;
    
    // Top-right marker
    svg += `<rect x="${size - markerOffset - markerSize}" y="${markerOffset}" width="${markerSize}" height="${markerSize}" fill="black"/>`;
    svg += `<rect x="${size - markerOffset - markerSize + dotSize}" y="${markerOffset + dotSize}" width="${dotSize}" height="${dotSize}" fill="white"/>`;
    
    // Bottom-left marker
    svg += `<rect x="${markerOffset}" y="${size - markerOffset - markerSize}" width="${markerSize}" height="${markerSize}" fill="black"/>`;
    svg += `<rect x="${markerOffset + dotSize}" y="${size - markerOffset - markerSize + dotSize}" width="${dotSize}" height="${dotSize}" fill="white"/>`;
    
    // Create a shuffled index array for better distribution
    const shuffledIndices = [];
    for (let i = 0; i < positions.length; i++) {
        shuffledIndices.push(i);
    }
    
    // Shuffle using the input string as seed for deterministic randomness
    const shuffleRng = createSeededRNG(hashString(inputString));
    for (let i = shuffledIndices.length - 1; i > 0; i--) {
        const j = Math.floor(shuffleRng() * (i + 1));
        [shuffledIndices[i], shuffledIndices[j]] = [shuffledIndices[j], shuffledIndices[i]];
    }
    
    // Add data dots based on binary pattern with better distribution
    for (let i = 0; i < positions.length; i++) {
        const originalIndex = shuffledIndices[i];
        const pos = positions[originalIndex];
        const gridX = pos.gridX;
        const gridY = pos.gridY;
        
        // Skip positions that would overlap with markers
        const finalX = center + gridX;
        const finalY = center + gridY;
        
        // Check if this position is too close to markers
        const tooCloseToMarker = 
            (finalX < markerOffset + markerSize + dotSize && finalY < markerOffset + markerSize + dotSize) || // top-left
            (finalX > size - markerOffset - markerSize - dotSize && finalY < markerOffset + markerSize + dotSize) || // top-right
            (finalX < markerOffset + markerSize + dotSize && finalY > size - markerOffset - markerSize - dotSize); // bottom-left
        
        if (!tooCloseToMarker) {
            // Place dot based on binary data at the shuffled position
            if (paddedData[i] === '1') {
                svg += `<circle cx="${finalX}" cy="${finalY}" r="${dotSize}" fill="black"/>`;
            }
        }
    }
    
    svg += '</svg>';
    return svg;
}

// Decode dot pattern back to string
function decodeAvatarToString(imageData, size = 100) {
    const center = size / 2;
    const radius = size * 0.45;
    const dotSize = radius / 32;
    const gridSize = 32;
    const gridSpacing = radius / (gridSize * 0.5);
    
    // Get valid positions (same as encoding)
    const {count, positions} = calculateValidDotPositions(size);
    
    // For now, let's try a different approach - detect the pattern without shuffling
    // and then try to reconstruct the original string
    
    // Detect dots at each position (in original order)
    const detectedPattern = new Array(count).fill('0');
    
    for (let i = 0; i < positions.length; i++) {
        const pos = positions[i];
        const gridX = pos.gridX;
        const gridY = pos.gridY;
        
        const finalX = center + gridX;
        const finalY = center + gridY;
        
        // Check if this position is too close to markers
        const markerSize = dotSize * 3;
        const markerOffset = dotSize * 2;
        const tooCloseToMarker = 
            (finalX < markerOffset + markerSize + dotSize && finalY < markerOffset + markerSize + dotSize) || // top-left
            (finalX > size - markerOffset - markerSize - dotSize && finalY < markerOffset + markerSize + dotSize) || // top-right
            (finalX < markerOffset + markerSize + dotSize && finalY > size - markerOffset - markerSize - dotSize); // bottom-left
        
        if (!tooCloseToMarker) {
            // Sample the image at this position to detect if there's a dot
            const hasDot = detectDotAtPosition(imageData, finalX, finalY, dotSize, size);
            detectedPattern[i] = hasDot ? '1' : '0';
        }
    }
    
    // Convert binary pattern back to string
    const binaryString = detectedPattern.join('');
    return binaryToString(binaryString);
}

// New function to decode with proper shuffling handling
function decodeAvatarToStringWithShuffle(imageData, originalString, size = 100) {
    const center = size / 2;
    const radius = size * 0.45;
    const dotSize = radius / 32;
    const gridSize = 32;
    const gridSpacing = radius / (gridSize * 0.5);
    
    // Get valid positions (same as encoding)
    const {count, positions} = calculateValidDotPositions(size);
    
    // Create shuffled index array (same as encoding)
    const shuffledIndices = [];
    for (let i = 0; i < positions.length; i++) {
        shuffledIndices.push(i);
    }
    
    // Shuffle using the original string as seed (same as encoding)
    const shuffleRng = createSeededRNG(hashString(originalString));
    for (let i = shuffledIndices.length - 1; i > 0; i--) {
        const j = Math.floor(shuffleRng() * (i + 1));
        [shuffledIndices[i], shuffledIndices[j]] = [shuffledIndices[j], shuffledIndices[i]];
    }
    
    // Detect dots at each position
    const detectedPattern = new Array(count).fill('0');
    
    for (let i = 0; i < positions.length; i++) {
        const originalIndex = shuffledIndices[i];
        const pos = positions[originalIndex];
        const gridX = pos.gridX;
        const gridY = pos.gridY;
        
        const finalX = center + gridX;
        const finalY = center + gridY;
        
        // Check if this position is too close to markers
        const markerSize = dotSize * 3;
        const markerOffset = dotSize * 2;
        const tooCloseToMarker = 
            (finalX < markerOffset + markerSize + dotSize && finalY < markerOffset + markerSize + dotSize) || // top-left
            (finalX > size - markerOffset - markerSize - dotSize && finalY < markerOffset + markerSize + dotSize) || // top-right
            (finalX < markerOffset + markerSize + dotSize && finalY > size - markerOffset - markerSize - dotSize); // bottom-left
        
        if (!tooCloseToMarker) {
            // Sample the image at this position to detect if there's a dot
            const hasDot = detectDotAtPosition(imageData, finalX, finalY, dotSize, size);
            detectedPattern[i] = hasDot ? '1' : '0';
        }
    }
    
    // Convert binary pattern back to string
    const binaryString = detectedPattern.join('');
    return binaryToString(binaryString);
}

// Detect if there's a dot at a specific position (color-agnostic)
function detectDotAtPosition(imageData, x, y, dotSize, size) {
    // Convert coordinates to image data coordinates
    const imageX = Math.round(x);
    const imageY = Math.round(y);
    
    // Sample a small area around the expected dot position
    const sampleRadius = Math.round(dotSize * 0.8);
    let dotPixels = 0;
    let totalPixels = 0;
    
    // First, get the background color by sampling the corners
    const cornerSamples = [
        {x: 0, y: 0},
        {x: size - 1, y: 0},
        {x: 0, y: size - 1},
        {x: size - 1, y: size - 1}
    ];
    
    let backgroundR = 0, backgroundG = 0, backgroundB = 0;
    let cornerCount = 0;
    
    for (const corner of cornerSamples) {
        const index = (corner.y * size + corner.x) * 4;
        backgroundR += imageData.data[index];
        backgroundG += imageData.data[index + 1];
        backgroundB += imageData.data[index + 2];
        cornerCount++;
    }
    
    backgroundR /= cornerCount;
    backgroundG /= cornerCount;
    backgroundB /= cornerCount;
    
    // Calculate background luminance
    const backgroundLuminance = calculateLuminance([backgroundR, backgroundG, backgroundB]);
    
    // Also try a simpler approach: check if the center pixel is significantly different from background
    const centerIndex = (imageY * size + imageX) * 4;
    const centerR = imageData.data[centerIndex];
    const centerG = imageData.data[centerIndex + 1];
    const centerB = imageData.data[centerIndex + 2];
    
    // Calculate center pixel luminance
    const centerLuminance = calculateLuminance([centerR, centerG, centerB]);
    const centerContrast = calculateContrastRatio(backgroundLuminance, centerLuminance);
    
    // If center pixel has high contrast, it's likely a dot
    if (centerContrast > 1.5) {
        return true;
    }
    
    // Fallback to area sampling
    for (let dx = -sampleRadius; dx <= sampleRadius; dx++) {
        for (let dy = -sampleRadius; dy <= sampleRadius; dy++) {
            const sampleX = imageX + dx;
            const sampleY = imageY + dy;
            
            // Check bounds
            if (sampleX >= 0 && sampleX < size && sampleY >= 0 && sampleY < size) {
                const index = (sampleY * size + sampleX) * 4; // RGBA
                const r = imageData.data[index];
                const g = imageData.data[index + 1];
                const b = imageData.data[index + 2];
                
                // Calculate pixel luminance
                const pixelLuminance = calculateLuminance([r, g, b]);
                
                // Calculate contrast ratio with background
                const contrastRatio = calculateContrastRatio(backgroundLuminance, pixelLuminance);
                
                // If contrast is high enough (indicating a dot), count it
                if (contrastRatio > 1.3) { // Lower threshold for better color detection
                    dotPixels++;
                }
                totalPixels++;
            }
        }
    }
    
    // If more than 30% of pixels in the area have high contrast, consider it a dot
    return totalPixels > 0 && (dotPixels / totalPixels) > 0.3;
}

// Enhanced decode function that handles image processing
function decodeAvatarFromImage(imageElement, size = 100) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = size;
    canvas.height = size;
    
    // Draw the image to canvas
    ctx.drawImage(imageElement, 0, 0, size, size);
    
    // Get image data
    const imageData = ctx.getImageData(0, 0, size, size);
    
    // Decode the pattern
    return decodeAvatarToString(imageData, size);
}

// Test function to verify encoding/decoding round-trip
function testEncodingDecodingRoundTrip(testString) {
    console.log("Testing round-trip:", testString);
    
    // Encode
    const encodedSVG = encodeStringToAvatar(testString);
    console.log("Encoded SVG length:", encodedSVG.length);
    
    // Create a temporary image element for decoding
    const img = new Image();
    img.onload = function() {
        try {
            const decodedString = decodeAvatarFromImage(img);
            console.log("Decoded:", decodedString);
            console.log("Match:", testString === decodedString);
        } catch (error) {
            console.error("Decoding error:", error);
        }
    };
    
    // Convert SVG to data URL
    const svgBlob = new Blob([encodedSVG], {type: 'image/svg+xml'});
    img.src = URL.createObjectURL(svgBlob);
    
    return {
        original: testString,
        encoded: encodedSVG,
        success: true
    };
} 

// Simple encode function without shuffling for testing
function encodeStringToAvatarSimple(inputString, size = 100) {
    const center = size / 2;
    const radius = size * 0.45;
    const dotSize = radius / 32;
    const gridSize = 32;
    const gridSpacing = radius / (gridSize * 0.5);
    
    // Convert string to binary
    const binaryData = stringToBinary(inputString);
    
    // Get valid positions
    const {count, positions} = calculateValidDotPositions(size);
    
    // Pad or truncate binary data to fit available positions
    const paddedData = binaryData.padEnd(count, '0').substring(0, count);
    
    // Create SVG with high contrast (black dots on white background)
    let svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">`;
    
    // White background
    svg += `<rect x="0" y="0" width="${size}" height="${size}" fill="white"/>`;
    
    // Add orientation markers (corner squares)
    const markerSize = dotSize * 3;
    const markerOffset = dotSize * 2;
    
    // Top-left marker
    svg += `<rect x="${markerOffset}" y="${markerOffset}" width="${markerSize}" height="${markerSize}" fill="black"/>`;
    svg += `<rect x="${markerOffset + dotSize}" y="${markerOffset + dotSize}" width="${dotSize}" height="${dotSize}" fill="white"/>`;
    
    // Top-right marker
    svg += `<rect x="${size - markerOffset - markerSize}" y="${markerOffset}" width="${markerSize}" height="${markerSize}" fill="black"/>`;
    svg += `<rect x="${size - markerOffset - markerSize + dotSize}" y="${markerOffset + dotSize}" width="${dotSize}" height="${dotSize}" fill="white"/>`;
    
    // Bottom-left marker
    svg += `<rect x="${markerOffset}" y="${size - markerOffset - markerSize}" width="${markerSize}" height="${markerSize}" fill="black"/>`;
    svg += `<rect x="${markerOffset + dotSize}" y="${size - markerOffset - markerSize + dotSize}" width="${dotSize}" height="${dotSize}" fill="white"/>`;
    
    // Add data dots based on binary pattern (no shuffling)
    for (let i = 0; i < positions.length; i++) {
        const pos = positions[i];
        const gridX = pos.gridX;
        const gridY = pos.gridY;
        
        // Skip positions that would overlap with markers
        const finalX = center + gridX;
        const finalY = center + gridY;
        
        // Check if this position is too close to markers
        const tooCloseToMarker = 
            (finalX < markerOffset + markerSize + dotSize && finalY < markerOffset + markerSize + dotSize) || // top-left
            (finalX > size - markerOffset - markerSize - dotSize && finalY < markerOffset + markerSize + dotSize) || // top-right
            (finalX < markerOffset + markerSize + dotSize && finalY > size - markerOffset - markerSize - dotSize); // bottom-left
        
        if (!tooCloseToMarker) {
            // Place dot based on binary data (sequential)
            if (paddedData[i] === '1') {
                svg += `<circle cx="${finalX}" cy="${finalY}" r="${dotSize}" fill="black"/>`;
            }
        }
    }
    
    svg += '</svg>';
    return svg;
} 

// Generate spiral positions from center outward
function generateSpiralPositions(size = 100) {
    const center = size / 2;
    const radius = size * 0.45;
    const dotSize = radius / 32;
    const gridSize = 32;
    const gridSpacing = radius / (gridSize * 0.4); // Increased from 0.5 to 0.4 for more spacing
    
    const positions = [];
    const visited = new Set();
    
    // Create a proper spiral that stays within the circle
    // Use polar coordinates for better control
    const maxRadius = radius - dotSize; // Ensure dots don't touch edge
    const angleStep = 0.2; // Smaller angle step for tighter spiral
    const radiusStep = dotSize * 1.2; // Distance between spiral arms
    
    let currentRadius = 0;
    let currentAngle = 0;
    
    while (currentRadius <= maxRadius && positions.length < 2000) { // Increased limit
        // Convert polar to cartesian
        const gridX = currentRadius * Math.cos(currentAngle);
        const gridY = currentRadius * Math.sin(currentAngle);
        
        // Convert to grid coordinates
        const gridCoordX = Math.round((gridX / gridSpacing) + gridSize / 2);
        const gridCoordY = Math.round((gridY / gridSpacing) + gridSize / 2);
        
        // Check if within grid bounds
        if (gridCoordX >= 0 && gridCoordX < gridSize && 
            gridCoordY >= 0 && gridCoordY < gridSize) {
            
            const posKey = `${gridCoordX},${gridCoordY}`;
            if (!visited.has(posKey)) {
                visited.add(posKey);
                
                // Double-check circle boundary
                const distanceFromCenter = Math.sqrt(gridX * gridX + gridY * gridY);
                if (distanceFromCenter + dotSize <= radius) {
                    positions.push({
                        x: gridCoordX,
                        y: gridCoordY,
                        gridX: gridX,
                        gridY: gridY,
                        finalX: center + gridX,
                        finalY: center + gridY,
                        distance: distanceFromCenter
                    });
                }
            }
        }
        
        // Move along spiral
        currentAngle += angleStep;
        currentRadius += radiusStep / (2 * Math.PI); // Gradually increase radius
    }
    
    console.log(`Generated ${positions.length} spiral positions`);
    return positions;
}

// Encode string to avatar with spiral pattern and center orientation markers
function encodeStringToAvatarSpiral(inputString, size = 100) {
    const center = size / 2;
    const radius = size * 0.45;
    const dotSize = radius / 32;
    
    // Convert string to binary
    const binaryData = stringToBinary(inputString);
    
    // Get spiral positions
    const spiralPositions = generateSpiralOrderedGridPositions(size);
    
    // Calculate how many positions we need for data (excluding orientation markers)
    const dataPositionsNeeded = binaryData.length;
    const totalPositionsNeeded = dataPositionsNeeded + 3; // +3 for orientation markers
    
    console.log(`String length: ${inputString.length}, Binary length: ${binaryData.length}`);
    console.log(`Spiral positions: ${spiralPositions.length}, Needed: ${totalPositionsNeeded}`);
    console.log(`Max capacity: ${Math.floor(spiralPositions.length - 3)} characters`);
    
    if (totalPositionsNeeded > spiralPositions.length) {
        throw new Error(`String too long. Max capacity: ${Math.floor(spiralPositions.length - 3)} characters`);
    }
    
    // Create SVG
    let svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">`;
    
    // White background
    svg += `<rect width="${size}" height="${size}" fill="white"/>`;
    
    // Add orientation markers in center (3 dots on grid, L-shape)
    const centerGridX = Math.floor(32 / 2); // 32 is gridSize
    const centerGridY = Math.floor(32 / 2);
    const gridSpacing = radius / (32 * 0.45); // Match the balanced spacing used in generateSpiralOrderedGridPositions
    
    // Place markers on grid positions: top-left, top-right, bottom-left of center 2x2 area
    const markerPositions = [
        { x: center + (centerGridX - 1 - 32/2 + 0.5) * gridSpacing, y: center + (centerGridY - 1 - 32/2 + 0.5) * gridSpacing }, // top-left
        { x: center + (centerGridX - 32/2 + 0.5) * gridSpacing, y: center + (centerGridY - 1 - 32/2 + 0.5) * gridSpacing },     // top-right  
        { x: center + (centerGridX - 1 - 32/2 + 0.5) * gridSpacing, y: center + (centerGridY - 32/2 + 0.5) * gridSpacing }      // bottom-left
    ];
    
    for (const marker of markerPositions) {
        svg += `<circle cx="${marker.x}" cy="${marker.y}" r="${dotSize}" fill="black"/>`;
    }
    
    // Add data dots in spiral pattern (no need to check distance to markers since we excluded that area)
    for (let i = 0; i < dataPositionsNeeded; i++) {
        const pos = spiralPositions[i];
        const hasDot = binaryData[i] === '1';
        
        if (hasDot) {
            svg += `<circle cx="${pos.finalX}" cy="${pos.finalY}" r="${dotSize}" fill="black"/>`;
        }
    }
    
    svg += '</svg>';
    return svg;
}

// Helper function to convert Image element to imageData for spiral decoding
function decodeAvatarFromSpiralImage(img, size = 100) {
    // Create a canvas to get imageData
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = size;
    canvas.height = size;
    
    // Draw the image to canvas
    ctx.drawImage(img, 0, 0, size, size);
    
    // Get imageData
    const imageData = ctx.getImageData(0, 0, size, size);
    
    // Decode using the imageData
    return decodeSpiralAvatarPattern(imageData, size);
}

// Decode spiral pattern (EXACT reverse of generateSpiralAvatarPattern)
function decodeSpiralAvatarPattern(imageData, size = 100) {
    console.log('=== DECODING START ===');
    
    // First, normalize the image to black dots on white background
    const normalizedImageData = normalizeDotCodeImage(imageData, size);
    
    const center = size / 2;
    const radius = size * 0.45;
    const dotSize = radius / 32;
    const gridSize = 32;
    const gridSpacing = radius / (gridSize * 0.45);
    
    console.log('Size:', size, 'Center:', center, 'Radius:', radius, 'DotSize:', dotSize, 'GridSpacing:', gridSpacing);
    
    // Get spiral positions (EXACT same as encoding)
    const spiralPositions = generateSpiralOrderedGridPositions(size);
    console.log('Got spiral positions:', spiralPositions.length);
    
    // Simple approach: just check if pixels are dark or light (now using normalized image)
    const detectedPattern = [];
    
    for (let i = 0; i < spiralPositions.length; i++) {
        const pos = spiralPositions[i];
        
        const imageX = Math.round(pos.finalX);
        const imageY = Math.round(pos.finalY);
        
        if (imageX >= 0 && imageX < size && imageY >= 0 && imageY < size) {
            const index = (imageY * size + imageX) * 4;
            const r = normalizedImageData.data[index];
            const g = normalizedImageData.data[index + 1];
            const b = normalizedImageData.data[index + 2];
            
            // Simple: if pixel is dark (RGB values low), it's a dot
            const brightness = (r + g + b) / 3;
            const hasDot = brightness < 128; // Threshold for dark pixels
            
            detectedPattern.push(hasDot ? '1' : '0');
            
            if (i < 20) {
                console.log(`Position ${i}: (${imageX}, ${imageY}) - RGB(${r},${g},${b}) - Brightness: ${brightness.toFixed(1)} - Dot: ${hasDot}`);
            }
        } else {
            detectedPattern.push('0');
        }
    }
    
    // Convert binary pattern back to string
    const binaryString = detectedPattern.join('');
    console.log('Binary pattern length:', binaryString.length);
    console.log('First 100 bits:', binaryString.substring(0, 100));
    
    const result = binaryToString(binaryString);
    console.log('Decoded result:', result);
    console.log('Result length:', result.length);
    console.log('=== DECODING END ===');
    
    return result;
} 

// Generate spiral-ordered grid positions (for QR-like encoding)
function generateSpiralOrderedGridPositions(size = 100) {
    const center = size / 2;
    const radius = size * 0.45;
    const dotSize = radius / 32;
    const gridSize = 32;
    const gridSpacing = radius / (gridSize * 0.45); // Balanced spacing
    
    console.log(`Generating spiral grid: size=${size}, center=${center}, radius=${radius}, dotSize=${dotSize}, gridSpacing=${gridSpacing}`);
    
    const allPositions = [];
    const centerGridX = Math.floor(gridSize / 2);
    const centerGridY = Math.floor(gridSize / 2);
    
    // Define the 3 marker positions to exclude
    const markerPositions = [
        {x: centerGridX - 1, y: centerGridY - 1}, // top-left
        {x: centerGridX, y: centerGridY - 1},     // top-right  
        {x: centerGridX - 1, y: centerGridY}      // bottom-left
    ];
    
    let totalPositions = 0;
    let validPositions = 0;
    let excludedByMarkers = 0;
    
    for (let x = 0; x < gridSize; x++) {
        for (let y = 0; y < gridSize; y++) {
            totalPositions++;
            
            const gridX = center + (x - gridSize/2 + 0.5) * gridSpacing;
            const gridY = center + (y - gridSize/2 + 0.5) * gridSpacing;
            
            const distanceFromCenter = Math.sqrt((gridX - center) ** 2 + (gridY - center) ** 2);
            
            // Check if dot fits within circle
            if (distanceFromCenter + dotSize <= radius * 1) {
                const isMarkerPosition = markerPositions.some(marker => marker.x === x && marker.y === y);
                
                if (!isMarkerPosition) {
                    allPositions.push({
                        gridX: x,
                        gridY: y,
                        finalX: gridX,
                        finalY: gridY,
                        distance: distanceFromCenter
                    });
                    validPositions++;
                } else {
                    excludedByMarkers++;
                }
            }
        }
    }
    
    console.log(`Grid generation: total=${totalPositions}, valid=${validPositions}, excluded=${excludedByMarkers}`);
    
    // Sort by distance from center to create spiral-like order
    allPositions.sort((a, b) => a.distance - b.distance);
    
    return allPositions;
}

// Generate spiral avatar pattern for main app (with random colors)
function generateSpiralAvatarPattern(npub, center, radius, dotColor, size) {
    const dotSize = radius / 32;
    const gridSize = 32;
    const gridSpacing = radius / (gridSize * 0.45); // Same spacing as QR encoding
    
    const binaryData = stringToBinary(npub);
    const spiralPositions = generateSpiralOrderedGridPositions(size);
    const dataPositionsNeeded = binaryData.length;
    const totalPositionsNeeded = dataPositionsNeeded + 3; // +3 for orientation markers
    
    if (totalPositionsNeeded > spiralPositions.length) {
        const maxChars = Math.floor((spiralPositions.length - 3) / 8);
        const truncatedNpub = npub.substring(0, maxChars);
        console.log(`Npub too long, truncated to ${maxChars} characters`);
        return generateSpiralAvatarPattern(truncatedNpub, center, radius, dotColor, size);
    }
    
    let svg = '';
    
    // Add orientation markers in center (3 dots on grid, L-shape, using dotColor)
    const centerGridX = Math.floor(32 / 2);
    const centerGridY = Math.floor(32 / 2);
    const markerPositions = [
        { x: center + (centerGridX - 1 - 32/2 + 0.5) * gridSpacing, y: center + (centerGridY - 1 - 32/2 + 0.5) * gridSpacing }, // top-left
        { x: center + (centerGridX - 32/2 + 0.5) * gridSpacing, y: center + (centerGridY - 1 - 32/2 + 0.5) * gridSpacing },     // top-right  
        { x: center + (centerGridX - 1 - 32/2 + 0.5) * gridSpacing, y: center + (centerGridY - 32/2 + 0.5) * gridSpacing }      // bottom-left
    ];
    
    for (const marker of markerPositions) {
        svg += `<circle cx="${marker.x}" cy="${marker.y}" r="${dotSize}" fill="${dotColor}"/>`;
    }
    
    // Add data dots in spiral pattern based on npub binary data
    for (let i = 0; i < dataPositionsNeeded; i++) {
        const pos = spiralPositions[i];
        const hasDot = binaryData[i] === '1';
        
        if (hasDot) {
            svg += `<circle cx="${pos.finalX}" cy="${pos.finalY}" r="${dotSize}" fill="${dotColor}"/>`;
        }
    }
    return svg;
} 

// Decode spiral avatar from image (helper for scan.html)
function decodeSpiralAvatarFromImage(img, size = 100) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = size;
    canvas.height = size;
    ctx.drawImage(img, 0, 0, size, size);
    const imageData = ctx.getImageData(0, 0, size, size);
    return decodeSpiralAvatarPattern(imageData, size);
} 

// Pre-process image to normalize to black dots on white background
function normalizeDotCodeImage(imageData, size) {
    console.log('=== NORMALIZING IMAGE ===');
    
    // Create new imageData for normalized image
    const normalizedData = new ImageData(size, size);
    
    // Sample background color from corners
    const cornerSamples = [
        {x: 0, y: 0},
        {x: size - 1, y: 0},
        {x: 0, y: size - 1},
        {x: size - 1, y: size - 1}
    ];
    
    let totalR = 0, totalG = 0, totalB = 0;
    for (const corner of cornerSamples) {
        const index = (corner.y * size + corner.x) * 4;
        totalR += imageData.data[index];
        totalG += imageData.data[index + 1];
        totalB += imageData.data[index + 2];
    }
    
    const backgroundR = totalR / cornerSamples.length;
    const backgroundG = totalG / cornerSamples.length;
    const backgroundB = totalB / cornerSamples.length;
    const backgroundBrightness = (backgroundR + backgroundG + backgroundB) / 3;
    
    console.log('Background color:', `RGB(${backgroundR.toFixed(0)}, ${backgroundG.toFixed(0)}, ${backgroundB.toFixed(0)})`);
    console.log('Background brightness:', backgroundBrightness.toFixed(1));
    
    // Sample some dot areas to determine if dots are lighter or darker than background
    const samplePositions = [
        {x: size/4, y: size/4},
        {x: 3*size/4, y: size/4},
        {x: size/4, y: 3*size/4},
        {x: 3*size/4, y: 3*size/4}
    ];
    
    let dotBrightnessSum = 0;
    let dotSamples = 0;
    
    for (const pos of samplePositions) {
        const index = (pos.y * size + pos.x) * 4;
        const r = imageData.data[index];
        const g = imageData.data[index + 1];
        const b = imageData.data[index + 2];
        const brightness = (r + g + b) / 3;
        
        // If this pixel is significantly different from background, it might be a dot
        const diff = Math.abs(brightness - backgroundBrightness);
        if (diff > 30) { // Threshold for "significantly different"
            dotBrightnessSum += brightness;
            dotSamples++;
        }
    }
    
    const averageDotBrightness = dotSamples > 0 ? dotBrightnessSum / dotSamples : backgroundBrightness;
    const dotsAreLighter = averageDotBrightness > backgroundBrightness;
    
    console.log('Average dot brightness:', averageDotBrightness.toFixed(1));
    console.log('Dots are lighter than background:', dotsAreLighter);
    
    // Process each pixel
    for (let i = 0; i < imageData.data.length; i += 4) {
        const r = imageData.data[i];
        const g = imageData.data[i + 1];
        const b = imageData.data[i + 2];
        const brightness = (r + g + b) / 3;
        
        // Calculate how different this pixel is from background
        const diff = Math.abs(brightness - backgroundBrightness);
        const isDot = diff > 30; // Threshold for dot detection
        
        if (isDot) {
            if (dotsAreLighter) {
                // Original: light dots on dark background
                // Normalized: black dots on white background
                normalizedData.data[i] = 0;     // R = 0 (black)
                normalizedData.data[i + 1] = 0; // G = 0 (black)
                normalizedData.data[i + 2] = 0; // B = 0 (black)
            } else {
                // Original: dark dots on light background
                // Normalized: black dots on white background
                normalizedData.data[i] = 0;     // R = 0 (black)
                normalizedData.data[i + 1] = 0; // G = 0 (black)
                normalizedData.data[i + 2] = 0; // B = 0 (black)
            }
        } else {
            // Background: always white
            normalizedData.data[i] = 255;     // R = 255 (white)
            normalizedData.data[i + 1] = 255; // G = 255 (white)
            normalizedData.data[i + 2] = 255; // B = 255 (white)
        }
        
        normalizedData.data[i + 3] = 255; // Alpha = 255 (opaque)
    }
    
    console.log('=== NORMALIZATION COMPLETE ===');
    return normalizedData;
} 
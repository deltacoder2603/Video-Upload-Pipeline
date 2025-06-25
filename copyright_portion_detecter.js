const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const email = 'crew6437@gmail.com';  // Replace with your email
const password = 'Crew@2004';       // Replace with your password

class YouTubeUploader {
    constructor() {
        this.browser = null;
        this.page = null;
        this.screenshotCount = 0;
        this.screenshotDir = './screenshots';
        if (!fs.existsSync(this.screenshotDir)) {
            fs.mkdirSync(this.screenshotDir);
        }
    }

    async init() {
        this.browser = await chromium.launchPersistentContext('./user-data', {
            headless: false,
            viewport: { width: 1280, height: 720 },
            args: [
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor'
            ]
        });
        this.page = await this.browser.newPage();
        console.log('Browser initialized with persistent session storage');
    }

    async takeScreenshot(name) {
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const screenshotPath = path.join(this.screenshotDir, `${this.screenshotCount++}_${name}_${timestamp}.png`);
        await this.page.screenshot({ path: screenshotPath });
        console.log(`Screenshot taken: ${screenshotPath}`);
    }

    // Extract video ID from YouTube URL
    extractVideoId(url) {
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
            /^([a-zA-Z0-9_-]{11})$/ // Direct video ID
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                return match[1];
            }
        }
        
        throw new Error('Invalid YouTube URL or video ID');
    }

    async checkLoginStatus() {
        try {
            await this.page.goto('https://www.youtube.com');
            await this.page.waitForLoadState('networkidle');
            await this.takeScreenshot('check-login-status');

            const profileButton = this.page.locator('button[aria-label*="Account"]');
            if (await profileButton.isVisible()) {
                console.log('Already logged in to YouTube');
                return true;
            }

            const signInButton = this.page.locator('a:has-text("Sign in")');
            return !(await signInButton.isVisible());
        } catch (error) {
            console.error('Error checking login status:', error);
            await this.takeScreenshot('check-login-status-error');
            return false;
        }
    }

    async login(email, password) {
        try {
            if (await this.checkLoginStatus()) {
                console.log('User is already logged in, skipping login process');
                return true;
            }

            console.log('User not logged in, starting login process...');
            await this.page.goto('https://accounts.google.com/signin');
            await this.page.waitForLoadState('networkidle');
            await this.takeScreenshot('google-signin-page');

            await this.page.waitForSelector('input[type="email"]');
            await this.page.fill('input[type="email"]', email);
            await this.page.click('#identifierNext');
            await this.takeScreenshot('after-email-entry');

            await this.page.waitForSelector('input[type="password"]', { timeout: 10000 });
            await this.page.fill('input[type="password"]', password);
            await this.page.click('#passwordNext');
            await this.takeScreenshot('after-password-entry');

            await this.page.waitForNavigation({ waitUntil: 'networkidle', timeout: 60000 });
            console.log('Login successful!');
            await this.takeScreenshot('login-successful');

            await this.page.goto('https://www.youtube.com');
            await this.page.waitForLoadState('networkidle');

            if (!(await this.checkLoginStatus())) {
                throw new Error('Login verification failed after navigation to YouTube');
            }
            console.log('Login verified successfully on YouTube!');
            await this.takeScreenshot('login-verified-on-youtube');
            return true;

        } catch (error) {
            console.error('Login failed:', error);
            await this.takeScreenshot('login-failed');
            throw error;
        }
    }

    async checkVideoCopyright(videoUrl) {
        try {
            const videoId = this.extractVideoId(videoUrl);
            console.log(`Extracted video ID: ${videoId}`);
            
            const copyrightUrl = `https://studio.youtube.com/video/${videoId}/copyright`;
            console.log(`Navigating to: ${copyrightUrl}`);
            
            await this.page.goto(copyrightUrl);
            await this.page.waitForLoadState('networkidle');
            await this.takeScreenshot('copyright-page-loaded');

            // Wait for the page to load with multiple possible selectors
            const pageLoadedSelectors = [
                'div:has-text("Video copyright")',
                'div:has-text("What happened")',
                'h1:has-text("Video copyright")',
                'div[class*="copyright"]',
                'main',
                'body'
            ];

            let pageLoaded = false;
            for (const selector of pageLoadedSelectors) {
                try {
                    await this.page.waitForSelector(selector, { timeout: 5000 });
                    console.log(`Page loaded, found element: ${selector}`);
                    pageLoaded = true;
                    break;
                } catch (e) {
                    // Continue to next selector
                }
            }

            if (!pageLoaded) {
                console.log('Page might not have loaded properly, but continuing...');
            }

            await this.page.waitForTimeout(3000); // Give page time to fully load

            // Look for "See details" buttons with multiple possible selectors
            const seeDetailsSelectors = [
                'button:has-text("See details")',
                'button:has-text("See Details")', 
                'button[aria-label*="details"]',
                'button[data-testid*="details"]',
                'button:has-text("details")',
                'a:has-text("See details")',
                'span:has-text("See details")'
            ];

            let seeDetailsButtons = [];
            for (const selector of seeDetailsSelectors) {
                try {
                    const buttons = await this.page.locator(selector).all();
                    if (buttons.length > 0) {
                        console.log(`Found ${buttons.length} "See details" button(s) with selector: ${selector}`);
                        seeDetailsButtons = buttons;
                        break;
                    }
                } catch (e) {
                    // Continue to next selector
                }
            }

            // If no "See details" buttons found, check if there are any copyright claims at all
            if (seeDetailsButtons.length === 0) {
                console.log('No "See details" buttons found. Checking for copyright claims...');
                
                // Check for copyright claims in different ways
                const claimIndicators = [
                    'div:has-text("IRAADAY")',
                    'div:has-text("ZAYEM")',
                    'div:has-text("Melody")',
                    'div:has-text("Content used")',
                    'div:has-text("Content type")',
                    'tr:has-text("This claim doesn\'t restrict your video")'
                ];

                let foundClaims = false;
                for (const indicator of claimIndicators) {
                    try {
                        const element = this.page.locator(indicator);
                        if (await element.isVisible()) {
                            console.log(`Found copyright claim indicator: ${indicator}`);
                            foundClaims = true;
                            break;
                        }
                    } catch (e) {
                        // Continue
                    }
                }

                if (!foundClaims) {
                    console.log('No copyright claims found for this video.');
                    await this.takeScreenshot('no-copyright-claims');
                    return {
                        hasClaims: false,
                        claims: []
                    };
                } else {
                    // Try to extract info directly from the page without clicking
                    console.log('Copyright claims found but no "See details" button. Extracting visible info...');
                    const claimInfo = await this.extractCopyrightDetailsFromMainPage();
                    this.displayCopyrightResults([claimInfo]);
                    return {
                        hasClaims: true,
                        claims: [claimInfo]
                    };
                }
            }

            console.log(`Found ${seeDetailsButtons.length} "See details" button(s)`);
            const claimDetails = [];

            for (let i = 0; i < seeDetailsButtons.length; i++) {
                try {
                    console.log(`Clicking "See details" button ${i + 1}`);
                    await seeDetailsButtons[i].click();
                    await this.page.waitForTimeout(3000); // Wait for details to load
                    await this.takeScreenshot(`claim-${i + 1}-details-opened`);

                    // Extract copyright information from the details panel
                    const claimInfo = await this.extractCopyrightDetails();
                    claimDetails.push(claimInfo);

                    // Close the details panel
                    const closeSelectors = [
                        'button[aria-label="Close"]',
                        'button:has-text("Close")',
                        'button[data-testid="close"]',
                        '[role="button"]:has-text("×")'
                    ];

                    let closed = false;
                    for (const closeSelector of closeSelectors) {
                        try {
                            const closeButton = this.page.locator(closeSelector);
                            if (await closeButton.isVisible()) {
                                await closeButton.click();
                                closed = true;
                                break;
                            }
                        } catch (e) {
                            // Continue
                        }
                    }

                    if (!closed) {
                        await this.page.keyboard.press('Escape');
                    }
                    
                    await this.page.waitForTimeout(1000);
                } catch (claimError) {
                    console.error(`Error processing claim ${i + 1}:`, claimError);
                    await this.takeScreenshot(`claim-${i + 1}-error`);
                }
            }

            // Display results in terminal
            this.displayCopyrightResults(claimDetails);

            return {
                hasClaims: true,
                claims: claimDetails
            };

        } catch (error) {
            console.error('Error checking video copyright:', error);
            await this.takeScreenshot('check-copyright-error');
            return {
                hasClaims: false,
                claims: [],
                error: error.message
            };
        }
    }

    async extractCopyrightDetailsFromMainPage() {
        try {
            const details = {};

            // Extract content name/title from the main copyright page
            const contentSelectors = [
                'td:has-text("IRAADAY")',
                'div:has-text("IRAADAY")',
                'span:has-text("IRAADAY")'
            ];

            for (const selector of contentSelectors) {
                try {
                    const element = this.page.locator(selector);
                    if (await element.isVisible()) {
                        details.contentTitle = await element.textContent();
                        break;
                    }
                } catch (e) {
                    // Continue
                }
            }

            // Extract claimant (ZAYEM)
            const claimantSelectors = [
                'td:has-text("ZAYEM")',
                'div:has-text("ZAYEM")',
                'span:has-text("ZAYEM")'
            ];

            for (const selector of claimantSelectors) {
                try {
                    const element = this.page.locator(selector);
                    if (await element.isVisible()) {
                        details.claimant = await element.textContent();
                        break;
                    }
                } catch (e) {
                    // Continue
                }
            }

            // Extract content type (Melody)
            const typeSelectors = [
                'td:has-text("Melody")',
                'div:has-text("Melody")',
                'span:has-text("Melody")'
            ];

            for (const selector of typeSelectors) {
                try {
                    const element = this.page.locator(selector);
                    if (await element.isVisible()) {
                        details.contentType = await element.textContent();
                        break;
                    }
                } catch (e) {
                    // Continue
                }
            }

            // Try to extract timeline from visible text
            const allText = await this.page.locator('body').textContent();
            const timeMatch = allText.match(/(\d+:\d+)\s*[-–]\s*(\d+:\d+)/);
            if (timeMatch) {
                details.timeline = `${timeMatch[1]} - ${timeMatch[2]}`;
            } else {
                details.timeline = 'Timeline not visible on main page';
            }

            return details;
        } catch (error) {
            console.error('Error extracting details from main page:', error);
            return {
                error: 'Failed to extract details from main page',
                timeline: 'Could not extract timeline'
            };
        }
    }

    async extractCopyrightDetails() {
        try {
            const details = {};

            // Extract content name/title
            const titleSelectors = [
                'h1', 'h2', 'h3',
                'div:has-text("IRAADAY")',
                '[data-test-id*="title"]',
                '.title'
            ];

            for (const selector of titleSelectors) {
                try {
                    const element = this.page.locator(selector).first();
                    if (await element.isVisible()) {
                        const text = await element.textContent();
                        if (text && text.trim()) {
                            details.contentTitle = text.trim();
                            break;
                        }
                    }
                } catch (e) {
                    // Continue
                }
            }

            // Extract claimant information
            const claimantSelectors = [
                'div:has-text("Claimants")',
                'div:has-text("ZAYEM")',
                '[data-test-id*="claimant"]'
            ];

            for (const selector of claimantSelectors) {
                try {
                    const element = this.page.locator(selector);
                    if (await element.isVisible()) {
                        const text = await element.textContent();
                        if (text && text.includes('ZAYEM')) {
                            details.claimant = 'ZAYEM';
                            break;
                        }
                    }
                } catch (e) {
                    // Continue
                }
            }

            // Extract timeline information - this is the key part
            const timelineSelectors = [
                'div:has-text("Content found in")',
                'div:has-text("0:")',
                'span:has-text("0:")',
                '[data-test-id*="timeline"]',
                'div[class*="timeline"]'
            ];

            let timeline = null;
            for (const selector of timelineSelectors) {
                try {
                    // Look for the element and its siblings/children for timeline
                    const element = this.page.locator(selector);
                    if (await element.isVisible()) {
                        // Check the element itself
                        let text = await element.textContent();
                        let timeMatch = text.match(/(\d+:\d+)\s*[-–]\s*(\d+:\d+)/);
                        
                        if (timeMatch) {
                            timeline = `${timeMatch[1]} - ${timeMatch[2]}`;
                            break;
                        }

                        // Check parent element
                        const parent = element.locator('..');
                        if (await parent.isVisible()) {
                            text = await parent.textContent();
                            timeMatch = text.match(/(\d+:\d+)\s*[-–]\s*(\d+:\d+)/);
                            if (timeMatch) {
                                timeline = `${timeMatch[1]} - ${timeMatch[2]}`;
                                break;
                            }
                        }

                        // Check next sibling
                        const sibling = element.locator('xpath=following-sibling::*[1]');
                        try {
                            if (await sibling.isVisible()) {
                                text = await sibling.textContent();
                                timeMatch = text.match(/(\d+:\d+)\s*[-–]\s*(\d+:\d+)/);
                                if (timeMatch) {
                                    timeline = `${timeMatch[1]} - ${timeMatch[2]}`;
                                    break;
                                }
                            }
                        } catch (e) {
                            // Continue
                        }
                    }
                } catch (e) {
                    // Continue to next selector
                }
            }

            // Fallback: search entire modal/popup content for timeline
            if (!timeline) {
                try {
                    const modalSelectors = [
                        '[role="dialog"]',
                        '.modal',
                        '[data-test-id*="modal"]',
                        '[class*="popup"]',
                        '[class*="dialog"]'
                    ];

                    for (const modalSelector of modalSelectors) {
                        try {
                            const modal = this.page.locator(modalSelector);
                            if (await modal.isVisible()) {
                                const modalText = await modal.textContent();
                                const timeMatch = modalText.match(/(\d+:\d+)\s*[-–]\s*(\d+:\d+)/);
                                if (timeMatch) {
                                    timeline = `${timeMatch[1]} - ${timeMatch[2]}`;
                                    break;
                                }
                            }
                        } catch (e) {
                            // Continue
                        }
                    }
                } catch (e) {
                    // Continue
                }
            }

            // Final fallback: search entire page
            if (!timeline) {
                const allText = await this.page.locator('body').textContent();
                const timeMatch = allText.match(/(\d+:\d+)\s*[-–]\s*(\d+:\d+)/);
                if (timeMatch) {
                    timeline = `${timeMatch[1]} - ${timeMatch[2]}`;
                }
            }

            details.timeline = timeline || 'Timeline not found';

            // Extract content type
            const contentTypeSelectors = [
                'div:has-text("Content type")',
                'span:has-text("Melody")',
                'div:has-text("Melody")',
                '[data-test-id*="content-type"]'
            ];

            for (const selector of contentTypeSelectors) {
                try {
                    const element = this.page.locator(selector);
                    if (await element.isVisible()) {
                        const text = await element.textContent();
                        if (text && text.includes('Melody')) {
                            details.contentType = 'Melody';
                            break;
                        }
                    }
                } catch (e) {
                    // Continue
                }
            }

            return details;
        } catch (error) {
            console.error('Error extracting copyright details:', error);
            return {
                error: 'Failed to extract details',
                timeline: 'Could not extract timeline'
            };
        }
    }

    displayCopyrightResults(claims) {
        console.log('\n' + '='.repeat(60));
        console.log('         COPYRIGHT CLAIMS ANALYSIS RESULTS');
        console.log('='.repeat(60));

        if (claims.length === 0) {
            console.log('No copyright claims found.');
            return;
        }

        claims.forEach((claim, index) => {
            console.log(`\nClaim #${index + 1}:`);
            console.log('-'.repeat(40));
            
            if (claim.contentTitle) {
                console.log(`📝 Content: ${claim.contentTitle}`);
            }
            
            if (claim.claimant) {
                console.log(`👤 Claimant: ${claim.claimant}`);
            }
            
            if (claim.timeline) {
                console.log(`⏰ Timeline: ${claim.timeline}`);
            }
            
            if (claim.contentType) {
                console.log(`🎵 Type: ${claim.contentType}`);
            }

            if (claim.error) {
                console.log(`❌ Error: ${claim.error}`);
            }
        });

        console.log('\n' + '='.repeat(60));
    }

    async findExistingVideo(videoTitle) {
        try {
            await this.page.goto('https://studio.youtube.com/channel/UC/videos');
            await this.page.waitForLoadState('networkidle');
            await this.takeScreenshot('youtube-studio-content-page');
            console.log(`Searching for video: "${videoTitle}"`);

            // Wait for the video list to be visible
            await this.page.waitForSelector('#video-list', { timeout: 60000 });

            // Check for video title in the list
            const videoLinkSelector = `a.ytcp-video-list-cell-video-title-container[title="${videoTitle}"]`;
            const videoLink = this.page.locator(videoLinkSelector);

            if (await videoLink.isVisible()) {
                console.log(`Found video: "${videoTitle}"`);
                await this.takeScreenshot('video-found');
                return videoLink;
            }

            console.log(`Video "${videoTitle}" not found`);
            await this.takeScreenshot('video-not-found');
            return null;
        } catch (error) {
            console.error('Error finding video:', error);
            await this.takeScreenshot('find-video-error');
            return null;
        }
    }

    async openVideoEditor(videoElement) {
        try {
            await videoElement.click();
            await this.page.waitForLoadState('networkidle');
            await this.takeScreenshot('video-details-page');

            const editorButton = this.page.locator('a[data-tooltip-text="Editor"]');
            await editorButton.click();
            await this.page.waitForLoadState('networkidle');
            console.log('Video editor opened');
            await this.takeScreenshot('video-editor-opened');
            return true;
        } catch (error) {
            console.error('Error opening video editor:', error);
            await this.takeScreenshot('open-editor-error');
            return false;
        }
    }

    async checkCopyrightStatus(videoTitle) {
        try {
            await this.page.goto('https://studio.youtube.com/channel/UC/videos');
            await this.page.waitForLoadState('networkidle');

            const videoElement = await this.findExistingVideo(videoTitle);
            if (!videoElement) {
                return { found: false, hasClaims: false, claims: [] };
            }

            // In the video list, the copyright information is usually in the same row
            const videoRow = this.page.locator(`a.ytcp-video-list-cell-video-title-container[title="${videoTitle}"]`).locator('ancestor::tr');
            const restrictionsCell = videoRow.locator('td.ytcp-video-list-cell-restrictions');

            let hasClaims = false;
            let claims = [];
            if (await restrictionsCell.isVisible()) {
                const restrictionsText = await restrictionsCell.innerText();
                if (restrictionsText.toLowerCase().includes('copyright')) {
                    hasClaims = true;
                    claims.push(restrictionsText.trim());
                    console.log(`Copyright claim found for "${videoTitle}": ${restrictionsText.trim()}`);
                    await this.takeScreenshot('copyright-claim-found');
                } else {
                    console.log(`No copyright claims detected for "${videoTitle}" in the list view.`);
                    await this.takeScreenshot('no-copyright-claim');
                }
            } else {
                 console.log('Restrictions column not found.');
                 await this.takeScreenshot('restrictions-column-not-found');
            }

            return {
                found: true,
                hasClaims: hasClaims,
                claims: claims
            };
        } catch (error) {
            console.error('Error checking copyright status:', error);
            await this.takeScreenshot('check-copyright-error');
            return { found: false, hasClaims: false, claims: [] };
        }
    }

    async handleCopyrightClaims(videoTitle) {
        try {
            console.log(`Handling copyright claims for "${videoTitle}"`);

            const videoElement = await this.findExistingVideo(videoTitle);
            if (!videoElement) {
                console.log('Video not found for copyright handling');
                return false;
            }

            if (!(await this.openVideoEditor(videoElement))) {
                console.log('Could not open video editor');
                return false;
            }

            // Logic to interact with the editor to handle claims would go here.
            // For now, we just take a screenshot of the editor.
            console.log('Ready to handle copyright claims in the editor.');
            await this.takeScreenshot('copyright-handling-in-editor');

            return true;
        } catch (error) {
            console.error('Error handling copyright claims:', error);
            await this.takeScreenshot('handle-copyright-error');
            return false;
        }
    }

    async publishVideo() {
        try {
            // This function assumes you are already on the video edit page
            await this.page.click('#visibility-button');
            await this.page.waitForSelector('#public-radio-button', { state: 'visible' });
            await this.page.click('#public-radio-button');
            await this.page.click('#done-button');
            await this.page.click('#save-button');
            await this.page.waitForSelector('span:has-text("Changes saved")', { timeout: 60000 });
            console.log('Video published successfully!');
            await this.takeScreenshot('video-published');
            return true;
        } catch (error) {
            console.error('Publishing failed:', error);
            await this.takeScreenshot('publish-failed');
            return false;
        }
    }

    async processExistingVideo(videoTitle) {
        try {
            console.log(`Processing existing video: "${videoTitle}"`);

            const copyrightStatus = await this.checkCopyrightStatus(videoTitle);

            if (!copyrightStatus.found) {
                console.log(`Video "${videoTitle}" not found in your channel`);
                return false;
            }

            if (copyrightStatus.hasClaims) {
                console.log('Copyright claims detected:', copyrightStatus.claims);

                const handled = await this.handleCopyrightClaims(videoTitle);
                if (handled) {
                    console.log('Copyright handling completed');
                } else {
                    console.log('Copyright handling failed or requires manual intervention');
                }
            } else {
                console.log('No copyright claims detected for this video');
            }

            return true;
        } catch (error) {
            console.error('Process failed:', error);
            await this.takeScreenshot('process-existing-video-error');
            return false;
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            console.log('Browser closed');
        }
    }
}

// Usage example
async function main() {
    const uploader = new YouTubeUploader();

    try {
        await uploader.init();
        const email = process.env.YOUTUBE_EMAIL || 'your_email@gmail.com';
        const password = process.env.YOUTUBE_PASSWORD || 'your_password';

        await uploader.login(email, password);

        const videoUrl = process.argv[2] || 'https://www.youtube.com/watch?v=YOUR_VIDEO_ID';

        if (videoUrl === 'https://www.youtube.com/watch?v=YOUR_VIDEO_ID') {
            console.log('Usage: node your_script_name.js "https://www.youtube.com/watch?v=VIDEO_ID"');
            console.log('   or: node your_script_name.js "VIDEO_ID"');
        } else {
            await uploader.checkVideoCopyright(videoUrl);
        }

    } catch (error) {
        console.error('Main process failed:', error);
    } finally {
        await uploader.close();
    }
}

if (require.main === module) {
    main();
}

module.exports = YouTubeUploader;

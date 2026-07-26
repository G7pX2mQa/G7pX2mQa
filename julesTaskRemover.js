// paste this code into the console of the Jules frontend when needing to mass archive all tasks.
async function nukePausedTasks() {
    // The exact SVG path for the three dots
    const dotPath = 'M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z';
    
    // Find all SVGs containing that path
    const svgs = document.querySelectorAll('svg');
    const dots = Array.from(svgs).filter(svg => svg.innerHTML.includes(dotPath));
    const buttons = dots.map(svg => svg.closest('button') || svg.closest('div[role="button"]')).filter(b => b);
    
    // Base Case: If no buttons are found, the list is completely empty
    if (buttons.length === 0) {
        console.log("No more tasks found. Full recursive cleanup complete!");
        return; 
    }

    console.log(`Found ${buttons.length} task menus in this batch. Clearing...`);

    for (let btn of buttons) {
        // Safety check: ensure the button still exists in the DOM before clicking
        if (!document.body.contains(btn)) continue;

        btn.click(); // Open the dropdown
        await new Promise(r => setTimeout(r, 400)); // Wait for menu to render
        
        // Find the visible "Archive" option
        const elements = document.querySelectorAll('div, span, li');
        const archiveBtn = Array.from(elements).find(el => 
            el.textContent.trim() === 'Archive' && el.getBoundingClientRect().width > 0
        );
        
        if (archiveBtn) {
            archiveBtn.click();
        } else {
            // Dismiss menu if "Archive" isn't found
            document.body.click(); 
        }
        
        await new Promise(r => setTimeout(r, 600)); // Pause before moving to the next task
    }
    
    console.log("Batch complete. Waiting for UI to fetch/render the next batch...");
    
    // Wait 2.5 seconds to allow the network to fetch the next 20 tasks
    await new Promise(r => setTimeout(r, 2500));
    
    // Recursive call to start the next batch
    nukePausedTasks();
}

nukePausedTasks();
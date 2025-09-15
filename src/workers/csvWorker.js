import * as Comlink from 'comlink';

// Email normalization
function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  return email.toLowerCase().trim();
}

// Name similarity calculation using Levenshtein distance
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  
  str1 = str1.toLowerCase().trim();
  str2 = str2.toLowerCase().trim();
  
  if (str1 === str2) return 1;
  
  const len1 = str1.length;
  const len2 = str2.length;
  
  if (len1 === 0) return 0;
  if (len2 === 0) return 0;
  
  // Use simple character comparison for performance
  let matches = 0;
  const minLen = Math.min(len1, len2);
  
  for (let i = 0; i < minLen; i++) {
    if (str1[i] === str2[i]) {
      matches++;
    }
  }
  
  return matches / Math.max(len1, len2);
}

// Map Groups column values to client_type_vip_status
function mapGroupsToClientType(groupsValue) {
  if (!groupsValue || typeof groupsValue !== 'string') return 'Other';
  
  const upperValue = groupsValue.toUpperCase().trim();
  
  // VIP Client Mappings
  if (upperValue === 'CUSTOMER, VIP CLIENT' || upperValue === 'VIP CLIENT, CUSTOMER') {
    return 'VIP Client';
  }
  
  if (upperValue === 'PROSPECT, LEAD, VIP CLIENT, CUSTOMER') {
    return 'VIP Client';
  }
  
  if (upperValue === 'PROSPECT, VIP CLIENT, CUSTOMER') {
    return 'VIP Client';
  }
  
  if (upperValue === 'OTHER, VIP CLIENT, CUSTOMER') {
    return 'VIP Client';
  }
  
  if (upperValue === 'PROSPECT, CUSTOMER, VIP CLIENT') {
    return 'VIP Client';
  }
  
  if (upperValue === 'CUSTOMER, BUYER AGENT, REALTOR, VIP CLIENT') {
    return 'VIP Client';
  }
  
  if (upperValue === 'CUSTOMER, MARKETPLACE-LEADS-PURCHASE, JOURNEY: HOT LEADS (PURCHASE), VIP CLIENT') {
    return 'VIP Client';
  }
  
  if (upperValue === 'CUSTOMER, REALTOR, VIP CLIENT') {
    return 'VIP Client';
  }
  
  if (upperValue === 'LEAD, CUSTOMER, VIP CLIENT') {
    return 'VIP Client';
  }
  
  // VIP Client + Financial Planner
  if (upperValue === 'CUSTOMER, VIP CLIENT, FINANCIAL PLANNER') {
    return 'VIP Client, Financial Planner';
  }
  
  // Customer Only Mappings
  if (upperValue === 'CUSTOMER') {
    return 'Customer';
  }
  
  if (upperValue === 'PROSPECT, CUSTOMER') {
    return 'Customer';
  }
  
  if (upperValue === 'CUSTOMER, PROSPECT') {
    return 'Customer';
  }
  
  if (upperValue === 'LEAD, CUSTOMER') {
    return 'Customer';
  }
  
  if (upperValue === 'CUSTOMER, LEAD') {
    return 'Customer';
  }
  
  if (upperValue === 'PROSPECT, CUSTOMER, LEAD') {
    return 'Customer';
  }
  
  if (upperValue === 'CUSTOMER, MARKETPLACE-LEADS-PURCHASE, JOURNEY: HOT LEADS (PURCHASE)') {
    return 'Customer';
  }
  
  if (upperValue === 'CUSTOMER, MARKETPLACE-LEADS-REFINANCE, JOURNEY: HOT LEADS (REFI)') {
    return 'Customer';
  }
  
  // Customer + Realtor Mappings
  if (upperValue === 'CUSTOMER, BUYER AGENT, REALTOR') {
    return 'Customer, Realtor';
  }
  
  if (upperValue === 'REALTOR, CUSTOMER, BUYER AGENT') {
    return 'Customer, Realtor';
  }
  
  if (upperValue === 'BUYER AGENT, REALTOR, CUSTOMER') {
    return 'Customer, Realtor';
  }
  
  if (upperValue === 'BUYER AGENT, REALTOR, CUSTOMER, PROSPECT') {
    return 'Customer, Realtor';
  }
  
  if (upperValue === 'CUSTOMER, LEAD, BUYER AGENT, REALTOR') {
    return 'Customer, Realtor';
  }
  
  if (upperValue === 'CUSTOMER, BUYER AGENT, REALTOR, SELLER AGENT') {
    return 'Customer, Realtor';
  }
  
  if (upperValue === 'BUYER AGENT, REALTOR, CUSTOMER, SELLER AGENT') {
    return 'Customer, Realtor';
  }
  
  if (upperValue === 'CUSTOMER, BUYER AGENT, REALTOR, FAMILY/FRIEND') {
    return 'Customer, Realtor';
  }
  
  if (upperValue === 'CUSTOMER, REALTOR') {
    return 'Customer, Realtor';
  }
  
  // Customer + Realtor + Other Partner
  if (upperValue === 'CUSTOMER, REALTOR, BUSINESS') {
    return 'Customer, Realtor, Other Partner';
  }
  
  // Customer + Other Partner
  if (upperValue === 'REFERRALPARTNER, CUSTOMER, MARKETPLACE-LEADS-PURCHASE, JOURNEY: HOT LEADS (PURCHASE)') {
    return 'Customer, Other Partner';
  }
  
  // Default to Other
  return 'Other';
}

// Map Group c column values to client_type_prospects
function mapGroupCToClientProspects(groupCValue) {
  if (!groupCValue || typeof groupCValue !== 'string') return 'Other Partner';
  
  const normalizedValue = groupCValue.trim();
  
  // Prospect/Lead/Customer Mappings
  if (normalizedValue === 'Prospect') {
    return 'Prospect';
  }
  
  if (normalizedValue === 'Lead') {
    return 'Prospect';
  }
  
  if (normalizedValue === 'Client') {
    return 'Customer';
  }
  
  if (normalizedValue === 'Client;Lead') {
    return 'Prospect'; // Active lead takes priority
  }
  
  if (normalizedValue === 'Client;Prospect') {
    return 'Prospect'; // Active prospect takes priority
  }
  
  if (normalizedValue === 'Lead;Prospect') {
    return 'Prospect';
  }
  
  if (normalizedValue === 'Friend;Lead') {
    return 'Prospect'; // Lead status takes priority
  }
  
  // Professional Services
  if (normalizedValue === 'Realtor') {
    return 'Realtor';
  }
  
  if (normalizedValue === 'Client;Realtor') {
    return 'Realtor'; // Professional role takes priority
  }
  
  if (normalizedValue === 'Business;Realtor') {
    return 'Realtor'; // Realtor takes priority
  }
  
  if (normalizedValue === 'CPA') {
    return 'CPA';
  }
  
  if (normalizedValue === 'Financial Planner') {
    return 'Financial Planner';
  }
  
  if (normalizedValue === 'Attorney') {
    return 'Other Partner';
  }
  
  if (normalizedValue === 'Appraiser') {
    return 'Other Partner';
  }
  
  // Real Estate Related Partners
  if (normalizedValue === 'Escrow Agent') {
    return 'Other Partner';
  }
  
  if (normalizedValue === 'Title Agent') {
    return 'Other Partner';
  }
  
  if (normalizedValue === 'Inspector') {
    return 'Other Partner';
  }
  
  if (normalizedValue === 'Mortgage Contact') {
    return 'Other Partner';
  }
  
  if (normalizedValue === 'Loan Rep') {
    return 'Other Partner';
  }
  
  if (normalizedValue === 'Developer') {
    return 'Other Partner';
  }
  
  if (normalizedValue === 'Builder') {
    return 'Other Partner';
  }
  
  if (normalizedValue === 'Vendor') {
    return 'Other Partner';
  }
  
  if (normalizedValue === 'Landlord') {
    return 'Other Partner';
  }
  
  // Personal/Internal
  if (normalizedValue === 'CoWorker') {
    return 'Personal';
  }
  
  if (normalizedValue === 'Friend') {
    return 'Personal';
  }
  
  if (normalizedValue === 'Family') {
    return 'Personal';
  }
  
  // Generic/Other
  if (normalizedValue === 'Business') {
    return 'Other Partner';
  }
  
  if (normalizedValue === 'Other') {
    return 'Other Partner';
  }
  
  if (normalizedValue === 'Assistant') {
    return 'Other Partner';
  }
  
  // Default
  return 'Other Partner';
}

// Build email index from chunk
async function buildEmailIndex(chunk, sourceFile, columnMapping) {
  console.log('🏗️ Worker: Building email index, chunk size:', chunk.length, 'mapping:', columnMapping);
  const index = {};
  const { emailColumn, firstNameColumn, lastNameColumn, splitNameColumn } = columnMapping;
  let validEmails = 0;
  
  for (let i = 0; i < chunk.length; i++) {
    const row = chunk[i];
    const email = normalizeEmail(row[emailColumn]);
    
    if (email) {
      validEmails++;
      let firstName, lastName;
      
      if (splitNameColumn && firstNameColumn === lastNameColumn) {
        // Split the combined name column
        const fullName = (row[firstNameColumn] || '').trim();
        const spaceIndex = fullName.indexOf(' ');
        
        if (spaceIndex > 0) {
          firstName = fullName.substring(0, spaceIndex);
          lastName = fullName.substring(spaceIndex + 1);
        } else {
          firstName = fullName;
          lastName = '';
        }
      } else {
        // Use separate columns
        firstName = row[firstNameColumn] || '';
        lastName = row[lastNameColumn] || '';
      }
      
      if (!index[email]) {
        index[email] = [];
      }
      
      index[email].push({
        email: email,
        firstName: firstName,
        lastName: lastName,
        sourceFile: sourceFile,
        rowIndex: i,
        originalRow: row
      });
    }
    
    // Yield control every 1000 rows
    if (i % 1000 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  
  console.log('✅ Worker: Index built with', Object.keys(index).length, 'unique emails from', validEmails, 'valid email rows');
  return index;
}

// Find duplicates in chunk
async function findDuplicates(chunk, emailIndex, sourceFile, columnMapping) {
  console.log('🔍 Worker: Finding duplicates, chunk size:', chunk.length, 'index size:', Object.keys(emailIndex).length);
  const duplicates = [];
  const { emailColumn, firstNameColumn, lastNameColumn, splitNameColumn, groupsColumn } = columnMapping;
  let candidatesChecked = 0;
  let debugCount = 0; // Only log first few for debugging
  
  for (let i = 0; i < chunk.length; i++) {
    const row = chunk[i];
    const email = normalizeEmail(row[emailColumn]);
    
    if (email && emailIndex[email]) {
      candidatesChecked++;
      const candidates = emailIndex[email];
      
      let firstName, lastName;
      
      if (splitNameColumn && firstNameColumn === lastNameColumn) {
        // Split the combined name column
        const fullName = (row[firstNameColumn] || '').trim();
        if (debugCount < 5) {
          console.log(`🔍 Debug ${debugCount + 1}: Splitting name "${fullName}" from column "${firstNameColumn}"`);
        }
        const spaceIndex = fullName.indexOf(' ');
        
        if (spaceIndex > 0) {
          firstName = fullName.substring(0, spaceIndex);
          lastName = fullName.substring(spaceIndex + 1);
        } else {
          firstName = fullName;
          lastName = '';
        }
        if (debugCount < 5) {
          console.log(`🔍 Debug ${debugCount + 1}: Split result - firstName: "${firstName}", lastName: "${lastName}"`);
        }
      } else {
        // Use separate columns
        firstName = row[firstNameColumn] || '';
        lastName = row[lastNameColumn] || '';
        if (debugCount < 5) {
          console.log(`🔍 Debug ${debugCount + 1}: Separate columns - firstName: "${firstName}" (from ${firstNameColumn}), lastName: "${lastName}" (from ${lastNameColumn})`);
        }
      }
      
      // Extract and map client type from Groups column if available
      let clientTypeVipStatus;
      let clientTypeProspects;
      if (groupsColumn && row[groupsColumn]) {
        if (groupsColumn.toLowerCase() === 'groups') {
          clientTypeVipStatus = mapGroupsToClientType(row[groupsColumn]);
          if (debugCount < 5) {
            console.log(`🔍 Debug ${debugCount + 1}: Groups value: "${row[groupsColumn]}" mapped to: "${clientTypeVipStatus}"`);
          }
        } else if (groupsColumn.toLowerCase() === 'group c') {
          clientTypeProspects = mapGroupCToClientProspects(row[groupsColumn]);
          if (debugCount < 5) {
            console.log(`🔍 Debug ${debugCount + 1}: Group c value: "${row[groupsColumn]}" mapped to: "${clientTypeProspects}"`);
          }
        }
      }
      
      for (const candidate of candidates) {
        // Skip if same file (basis file check)
        if (candidate.sourceFile === sourceFile) continue;
        
        if (debugCount < 5) {
          console.log(`🔍 Debug ${debugCount + 1}: Comparing with candidate - firstName: "${candidate.firstName}", lastName: "${candidate.lastName}"`);
        }
        
        const firstNameSim = calculateSimilarity(
          firstName,
          candidate.firstName
        );
        
        const lastNameSim = calculateSimilarity(
          lastName,
          candidate.lastName
        );
        
        // Calculate overall confidence
        const confidence = (1.0 + firstNameSim + lastNameSim) / 3; // Email match + name similarities
        
        if (debugCount < 5) {
          console.log(`🔍 Debug ${debugCount + 1}: Similarity scores - firstNameSim: ${firstNameSim.toFixed(3)}, lastNameSim: ${lastNameSim.toFixed(3)}, confidence: ${confidence.toFixed(3)}`);
        }
        
        // Only consider high confidence matches
        if (confidence >= 0.7) {
          console.log(`✅ DUPLICATE FOUND! Email: ${email}, confidence: ${confidence.toFixed(3)}`);
          const duplicate = {
            id: `${email}-${sourceFile}-${i}`,
            email: email,
            firstName: firstName,
            lastName: lastName,
            sourceFile: sourceFile,
            confidence: confidence,
            rowIndex: i
          };
          
          // Add client type if available
          if (clientTypeVipStatus) {
            duplicate.clientTypeVipStatus = clientTypeVipStatus;
          }
          
          // Add client type prospects if available
          if (clientTypeProspects) {
            duplicate.clientTypeProspects = clientTypeProspects;
          }
          
          duplicates.push(duplicate);
          
          break; // Only report first match per row
        } else if (debugCount < 5) {
          console.log(`❌ Debug ${debugCount + 1}: Confidence ${confidence.toFixed(3)} below threshold 0.7`);
        }
        
        if (debugCount < 5) {
          debugCount++;
        }
      }
    }
    
    // Yield control every 500 rows
    if (i % 500 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  
  console.log('✅ Worker: Found', duplicates.length, 'duplicates from', candidatesChecked, 'candidates checked');
  return duplicates;
}

// Expose functions to main thread
const workerApi = {
  buildEmailIndex,
  findDuplicates
};

Comlink.expose(workerApi);
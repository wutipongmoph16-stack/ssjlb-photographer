
      // =====================================
      const GAS_URL = "https://script.google.com/macros/s/AKfycbyWwlz0VHuH7z9kXxgCaw_LU4QIfpZ9S9ZBZWPzfgmYgzmUaEG6qWuxHNvHL7goqheW2A/exec"; // Yuttasad
      const LIFF_ID = "2008846144-kbJ6yOGH";  // STG-AllLogin
      // =====================================

      let currentUser = null,
        userRequestsData = [],
        allRequestsData = [],
        currentLineUID = "";
        
      let globalActivities = [],
        globalPRChannels = [],
        globalDeliveries = [],
        photographersList = [];
        
      let globalApprovedEvents = [],
        currentAdminPage = 1;
      const adminItemsPerPage = 10;

      // 📌 ตัวแปรเช็คว่าโหลดข้อมูลฟอร์มหรือยัง (Lazy Load Flag)
      let formOptionsLoaded = false;

      async function api(action, data = {}) {
        const res = await fetch(GAS_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ action, data }),
        });
        return await res.json();
      }

      function getThaiDateFull(dateStr) {
        if (!dateStr) return "";
        const months = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
      }

      const fmtTime = (t) => {
        if (!t) return "00:00";
        if (typeof t === "string" && t.includes(":") && !t.includes("T")) return t.substring(0, 5);
        let d = new Date(t);
        if (!isNaN(d.getTime())) return d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0");
        return "00:00";
      };

      function setSession(profile, minutes) {
        const now = new Date();
        localStorage.setItem("pr_user_session", JSON.stringify({ value: profile, expiry: now.getTime() + minutes * 60 * 1000 }));
      }
      
      function getSession() {
        const itemStr = localStorage.getItem("pr_user_session");
        if (!itemStr) return null;
        const item = JSON.parse(itemStr);
        if (new Date().getTime() > item.expiry) {
          localStorage.removeItem("pr_user_session");
          return null;
        }
        return item.value;
      }
      
      function clearSession() {
        localStorage.removeItem("pr_user_session");
      }

      function togglePassword(inputId, btn) {
        const input = document.getElementById(inputId);
        const icon = btn.querySelector("i");
        if (input.type === "password") {
          input.type = "text";
          icon.classList.replace("bi-eye", "bi-eye-slash");
        } else {
          input.type = "password";
          icon.classList.replace("bi-eye-slash", "bi-eye");
        }
      }

     // =====================================
  // 1. โหลดข้อมูลเริ่มต้น (แบบ Fast Load)
  // =====================================
  let isInitialLoad = true;
  window.onload = async () => {
    Swal.fire({
      title: "กำลังเตรียมหน้าจอ...",
      html: "ระบบกำลังดึงข้อมูลปฏิทิน<br>กรุณารอสักครู่",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      // 📌 1. วาด UI พื้นฐานทันที (Dropdown เวลา, ดักปุ่ม Enter) ไม่ต้องรอเน็ต
      let hhOpts = '<option value="" disabled selected>ชั่วโมง</option>';
      for (let i = 0; i <= 23; i++) hhOpts += `<option value="${i.toString().padStart(2, "0")}">${i.toString().padStart(2, "0")}</option>`;
      document.querySelectorAll(".time-hh").forEach((el) => (el.innerHTML = hhOpts));

      let mmOpts = '<option value="" disabled selected>นาที</option>';
      for (let i = 0; i <= 45; i += 15) mmOpts += `<option value="${i.toString().padStart(2, "0")}">${i.toString().padStart(2, "0")}</option>`;
      document.querySelectorAll(".time-mm").forEach((el) => (el.innerHTML = mmOpts));

      const logPassInput = document.getElementById("logPass");
      if (logPassInput) {
        logPassInput.addEventListener("keypress", function (e) {
          if (e.key === "Enter") { e.preventDefault(); manualLogin(); }
        });
      }

      // 📌 2. จัดการ Session ควบคู่ไปเลย
      const session = getSession();
      if (session) {
        currentUser = session;
        document.getElementById("authSection").classList.add("hidden");
        document.getElementById("mainNav").classList.remove("hidden");
        document.getElementById("navUserName").innerText = `คุณ ${currentUser.name} (${currentUser.role})`;

        // สั่งโหลดตารางคิวงาน โดยไม่ต้องใช้ await บล็อกคิว (ให้มันโหลดขนานกันไปเลย)
        if (currentUser.role === "Admin") loadAdminDash();
        else loadUserDash();
      } else {
        if (LIFF_ID && LIFF_ID !== "YOUR_LIFF_ID_HERE") {
          // ปล่อยให้ liff โหลดเบื้องหลัง
          liff.init({ liffId: LIFF_ID }).then(async () => {
            if (liff.isLoggedIn()) currentLineUID = (await liff.getProfile()).userId;
          });
        }
      }

      // 📌 3. ฟังก์ชัน Pop-up กดดูคิวงานรายวัน (ย้ายออกมาประกาศไว้ตรงนี้)
      const showDailyQueue = (dateStr) => {
        let dayEvents = globalApprovedEvents.filter((ev) => ev.dateStr === dateStr);
        dayEvents.sort((a, b) => a.startStr.localeCompare(b.startStr));
        
        if (dayEvents.length === 0) return Swal.fire("ตารางคิวงาน", `ไม่มีคิวงาน PR ในวันที่ ${getThaiDateFull(dateStr)}`, "info");

        let html = `<div class="text-start" style="font-size: 0.95rem; line-height: 1.5; max-height: 60vh; overflow-y: auto; overflow-x: hidden; padding-right: 5px;">
                      <h5 class="fw-bold text-teal border-bottom pb-2 mb-3"><i class="bi bi-calendar-event"></i> ประจำวันที่ ${getThaiDateFull(dateStr)}</h5>`;

        dayEvents.forEach((ev) => {
          html += `<div class="mb-3 p-3 bg-light rounded border-start border-4 ${ev.color === "#64748b" ? "border-secondary" : "border-success"} shadow-sm">
                    <div class="${ev.color === "#64748b" ? "text-secondary" : "text-primary"} fw-bold mb-2 pb-2 border-bottom">
                      <i class="bi bi-clock"></i> ${ev.startStr} - ${ev.endStr} น. ${ev.color === "#64748b" ? '<span class="badge bg-secondary ms-2"><i class="bi bi-check2-all"></i> เสร็จสิ้นแล้ว</span>' : ""}
                    </div>
                    <div class="mb-1 text-dark"><b><i class="bi bi-bookmark-star text-warning"></i> โครงการ:</b> ${ev.projectName}</div>
                    <div class="mb-1 text-dark"><b><i class="bi bi-geo-alt text-danger"></i> สถานที่:</b> ${ev.location || "-"}</div>
                    <div class="mb-2 text-dark"><b><i class="bi bi-camera-reels text-info"></i> กิจกรรม:</b> <span class="text-muted">${ev.activities || "-"}</span></div>
                    <div class="mt-2 pt-2 border-top text-dark" style="font-size: 0.9rem;">
                      <b><i class="bi bi-person-badge text-secondary"></i> ผู้ขอ:</b> ${ev.reqName} (${ev.reqDept})<br>
                      <b><i class="bi bi-telephone text-secondary"></i> ติดต่อ:</b> ${ev.reqPhone || "-"}
                    </div>
                    <div class="mt-2 p-2 bg-white border rounded text-dark text-center">
                      <b><i class="bi bi-person-video text-success"></i> ช่างภาพผู้รับผิดชอบ:</b> <span class="fw-bold ${ev.color === "#64748b" ? "text-secondary" : "text-success"}">${ev.assignedTo}</span>
                    </div>
                  </div>`;
        });
        html += `</div>`;
        Swal.fire({ html: html, width: "600px", showConfirmButton: true, confirmButtonText: "ปิดหน้าต่าง", confirmButtonColor: "#0f766e" });
      };

      // 📌 4. ปล่อยให้ FullCalendar วาดหน้าตาปฏิทินขึ้นมาก่อน แล้วค่อยไปเรียก API เอง
      const calendar = new FullCalendar.Calendar(document.getElementById("calendar"), {
        initialView: window.innerWidth < 768 ? "listMonth" : "dayGridMonth",
        locale: "th",
        headerToolbar: { left: "prev,next", center: "title", right: "dayGridMonth,listMonth" },

        events: async function (fetchInfo, successCallback, failureCallback) {

          try {
            const res = await api("getApprovedEvents", { start: fetchInfo.startStr, end: fetchInfo.endStr });
            if (res.status === "success") {
              globalApprovedEvents = res.data; 
              successCallback(res.data);
              
              if (isInitialLoad) {
                Swal.close(); 
                isInitialLoad = false; // เปลี่ยนสถานะเป็นเท็จ เพื่อไม่ให้ปิด Swal ในการเปลี่ยนเดือนครั้งต่อไป
              }

            } else {
              failureCallback();
            }
          } catch (e) {
            failureCallback();
          } 
        },

        dateClick: function (info) { showDailyQueue(info.dateStr); },
        eventClick: function (info) { showDailyQueue(info.event.startStr.split("T")[0]); },
      });
      
      calendar.render();

      
    } catch (e) {
      console.error("Init Error", e);
      Swal.fire("ข้อผิดพลาด", "ไม่สามารถเชื่อมต่อระบบได้ กรุณารีเฟรชหน้าเว็บ", "error");
    }
  }; //end onload

      // =====================================
      // 3. LAZY LOAD ฟอร์ม (ดึงตอนกดสร้าง/แก้ หรือสมัครสมาชิก)
      // =====================================
      async function loadFormOptions() {
        if (formOptionsLoaded) return; // ถ้าเคยโหลดแล้ว ข้ามไปเลย (ไวมาก)
        
        Swal.fire({ title: 'กำลังเตรียมแบบฟอร์ม...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        try {
          const res = await api("getDropdowns");
          if (res.status === "success") {
            globalActivities = res.activities;
            globalPRChannels = res.prChannels;
            globalDeliveries = res.deliveries;
            photographersList = res.photographers || [];
            
            const fillDD = (id, arr) => {
              let html = '<option value="" disabled selected>-- เลือก --</option>';
              arr.forEach((a) => (html += `<option value="${a}">${a}</option>`));
              if(document.getElementById(id)) document.getElementById(id).innerHTML = html;
            };
            // 📌 เพิ่มคำสั่ง sort เรียงตัวอักษรภาษาไทย ก-ฮ
            fillDD("ddPos", res.positions.sort((a, b) => a.localeCompare(b, 'th')));
            
            // 💡 แนะนำให้เรียง "แผนก" ด้วยครับ จะได้ค้นหาง่ายเหมือนกัน
            fillDD("ddDept", res.departments.sort((a, b) => a.localeCompare(b, 'th')));
            fillDD("ddVeh", res.vehicles);
            fillDD("ddRoom", res.meetingRooms);
            
            let outHtml = "";
            res.outLocations.forEach((L) => (outHtml += `<option value="${L}">`));
            if(document.getElementById("outLocList")) document.getElementById("outLocList").innerHTML = outHtml;
            
            let actHtml = "";
            res.activities.forEach((a) => {
              if (a === "อื่นๆ")
                actHtml += `<div class="col-md-6 form-check"><input class="form-check-input chk-act" type="checkbox" value="อื่นๆ" onchange="document.getElementById('otherActTxt').classList.toggle('hidden', !this.checked)"><label class="form-check-label small">อื่นๆ</label><input type="text" id="otherActTxt" class="form-control form-control-sm mt-1 hidden" placeholder="ระบุกิจกรรม"></div>`;
              else
                actHtml += `<div class="col-md-6 form-check"><input class="form-check-input chk-act" type="checkbox" value="${a}"><label class="form-check-label small">${a}</label></div>`;
            });
            if(document.getElementById("chkActivities")) document.getElementById("chkActivities").innerHTML = actHtml;
            
            let prHtml = "";
            res.prChannels.forEach((p) => {
              if (p === "อื่นๆ")
                prHtml += `<div class="col-md-4 form-check"><input class="form-check-input chk-pr" type="checkbox" value="อื่นๆ" onchange="document.getElementById('otherPrTxt').classList.toggle('hidden', !this.checked)"><label class="form-check-label small">อื่นๆ</label><input type="text" id="otherPrTxt" class="form-control form-control-sm mt-1 hidden" placeholder="ระบุช่องทาง"></div>`;
              else
                prHtml += `<div class="col-md-4 form-check"><input class="form-check-input chk-pr" type="checkbox" value="${p}"><label class="form-check-label small">${p}</label></div>`;
            });
            if(document.getElementById("chkPRChannels")) document.getElementById("chkPRChannels").innerHTML = prHtml;
            
            let delHtml = "";
            res.deliveries.forEach((d) => {
              if (d === "อื่นๆ")
                delHtml += `<div class="col-md-4 form-check"><input class="form-check-input chk-del" type="checkbox" value="อื่นๆ" onchange="document.getElementById('otherDelTxt').classList.toggle('hidden', !this.checked)"><label class="form-check-label small">อื่นๆ</label><input type="text" id="otherDelTxt" class="form-control form-control-sm mt-1 hidden" placeholder="ระบุช่องทางส่งกลับ"></div>`;
              else
                delHtml += `<div class="col-md-4 form-check"><input class="form-check-input chk-del" type="checkbox" value="${d}"><label class="form-check-label small">${d}</label></div>`;
            });
            if(document.getElementById("chkDeliveries")) document.getElementById("chkDeliveries").innerHTML = delHtml;

            formOptionsLoaded = true; // จำไว้ว่าโหลดเสร็จแล้ว
          }
        } catch (e) {
          console.error("Load Options Error", e);
        }
        Swal.close();
      }

      // =====================================
      // การแสดงผลหน้าจอต่างๆ
      // =====================================
      async function toggleAuth() {
        // โหลด Dropdown ให้ฟอร์มสมัครสมาชิก (แผนก/ตำแหน่ง) ถ้ายังไม่ได้โหลด
        if(document.getElementById("loginBox").classList.contains("hidden") === false) {
           await loadFormOptions();
        }
        document.getElementById("loginBox").classList.toggle("hidden");
        document.getElementById("regBox").classList.toggle("hidden");
      }

      async function loginWithLine() {
        if (!liff.isLoggedIn()) { liff.login(); return; }
        Swal.fire({ title: "กำลังล็อกอิน...", didOpen: () => Swal.showLoading() });
        const res = await api("checkLineAuth", { uid: currentLineUID });
        if (res.status === "success") processLoginSuccess(res.profile);
        else {
          Swal.fire("ข้อมูล", "ไม่พบบัญชีที่ผูกกับ LINE นี้", "info");
          document.getElementById("lineBindAlert").classList.remove("hidden");
        }
      }

      async function manualLogin() {
        const user = document.getElementById("logUser").value, pass = document.getElementById("logPass").value;
        if (!user || !pass) return;
        Swal.fire({ title: "กำลังตรวจสอบผู้ใช้งาน...", didOpen: () => Swal.showLoading() });
        const res = await api("checkAuth", { user, pass, lineUID: currentLineUID });
        if (res.status === "success") processLoginSuccess(res.profile);
        else Swal.fire("ล้มเหลว", res.message, "error");
      }

      function processLoginSuccess(profile) {
        currentUser = profile;
        setSession(profile, 30);
        document.getElementById("authSection").classList.add("hidden");
        document.getElementById("mainNav").classList.remove("hidden");
        document.getElementById("navUserName").innerText = `คุณ ${currentUser.name} (${currentUser.role})`;
        Swal.close();
        currentUser.role === "Admin" ? loadAdminDash() : loadUserDash();
      }
      
      function logout() {
        clearSession();
        location.reload();
      }

      function resetNavButtons() {
        let btn = document.getElementById("btnNavPhoto");
        if (btn && currentUser) {
          if (photographersList.includes(currentUser.name) || currentUser.role === "Admin") {
            btn.innerHTML = '<i class="bi bi-person-video"></i> โหมดช่างภาพ';
            btn.classList.remove("btn-warning", "hidden");
            btn.classList.add("btn-outline-warning");
            btn.setAttribute("onclick", "showPhotoDash()");
          } else {
            btn.classList.add("hidden");
          }
        }
      }
      
      function setPhotoNavButton() {
        let btn = document.getElementById("btnNavPhoto");
        if (btn) {
          btn.innerHTML = '<i class="bi bi-arrow-left-circle"></i> กลับหน้าหลัก';
          btn.classList.remove("btn-outline-warning");
          btn.classList.add("btn-warning");
          btn.setAttribute("onclick", "currentUser.role==='Admin'?loadAdminDash():loadUserDash()");
        }
      }

      function toggleLocUI() {
        let t = document.querySelector('input[name="locType"]:checked').value;
        document.getElementById("divLocIn").classList.toggle("hidden", t !== "ใน สสจ.");
        document.getElementById("divLocOut").classList.toggle("hidden", t !== "นอก สสจ.");
        document.getElementById("vehRow").classList.toggle("hidden", t !== "นอก สสจ.");

        if (t !== "นอก สสจ.") {
          document.getElementById("ddVeh").removeAttribute("required");
          document.getElementById("outLocation").removeAttribute("required");
          document.getElementById("ddRoom").setAttribute("required", "true");
        } else {
          document.getElementById("ddVeh").setAttribute("required", "true");
          document.getElementById("outLocation").setAttribute("required", "true");
          document.getElementById("ddRoom").removeAttribute("required");
          document.getElementById("otherRoom").removeAttribute("required");
        }
      }

      function toggleRoomUI() {
        let val = document.getElementById("ddRoom").value;
        let isOther = val === "สถานที่อื่นๆ ภายใน สสจ.";
        document.getElementById("otherRoom").classList.toggle("hidden", !isOther);
        if (isOther) document.getElementById("otherRoom").setAttribute("required", "true");
        else document.getElementById("otherRoom").removeAttribute("required");
      }

      function hideAllDash() {
        ["userDash", "adminDash", "photoDash", "reqFormSec"].forEach((id) =>
          document.getElementById(id).classList.add("hidden")
        );
      }

      // =====================================
      // 📌 เปิดฟอร์ม (รองรับ Lazy Load)
      // =====================================
      async function showForm(editData = null) {
        await loadFormOptions(); // รอโหลดข้อมูล Dropdown ให้เสร็จก่อนเปิดหน้าต่าง

        const btnSubmit = document.getElementById('btnSubmitForm');
    if (btnSubmit) {
      btnSubmit.disabled = false; // เปิดให้กดได้
      btnSubmit.innerHTML = editData ? "บันทึกการแก้ไข" : "บันทึกส่งคำขอ"; // คืนค่าข้อความปุ่ม
      btnSubmit.className = editData ? "btn btn-warning w-100 py-3 fw-bold fs-5 mt-2 shadow" : "btn btn-success w-100 py-3 fw-bold fs-5 mt-2 shadow";
    }

        hideAllDash(); 
        document.getElementById('reqFormSec').classList.remove('hidden'); 
        document.getElementById('serviceForm').reset();
        
        ['otherActTxt', 'otherPrTxt', 'otherDelTxt'].forEach(id => { 
          if(document.getElementById(id)) { 
            document.getElementById(id).classList.add('hidden'); 
            document.getElementById(id).value = ""; 
          }
        });
        
        if(editData) {
          document.getElementById('formTitle').innerText = "แก้ไขคำขอ: " + editData.RequestID; 
          document.getElementById('btnSubmitForm').innerText = "บันทึกการแก้ไข"; 
          document.getElementById('btnSubmitForm').classList.replace('btn-success', 'btn-warning');
          document.getElementById('editId').value = editData.RequestID; 
          document.getElementById('projectName').value = editData.ProjectName; 
          document.getElementById('eventDate').value = new Date(editData.EventDate).toISOString().split('T')[0];
          
          const st = fmtTime(editData.StartTime).split(':');
          if(st.length === 2) { document.getElementById('startHH').value = st[0]; document.getElementById('startMM').value = st[1]; }
          
          const en = fmtTime(editData.EndTime).split(':');
          if(en.length === 2) { document.getElementById('endHH').value = en[0]; document.getElementById('endMM').value = en[1]; }
          
          const dp = fmtTime(editData.DepTime).split(':');
          if(dp.length === 2 && dp[0] !== "00") { 
            document.getElementById('depHH').value = dp[0]; document.getElementById('depMM').value = dp[1]; 
          } else {
            document.getElementById('depHH').value = ""; document.getElementById('depMM').value = "";
          }
          
          if(editData.LocationType === 'นอก สสจ.') { 
            document.getElementById('locOut').checked = true; toggleLocUI(); 
            document.getElementById('outLocation').value = editData.Location || ""; 
          } else { 
            document.getElementById('locIn').checked = true; toggleLocUI(); 
            let loc = editData.Location || ""; 
            let opts = Array.from(document.getElementById('ddRoom').options).map(o => o.value);
            if(opts.includes(loc) && loc !== 'สถานที่อื่นๆ ภายใน สสจ.') { 
              document.getElementById('ddRoom').value = loc; toggleRoomUI(); document.getElementById('otherRoom').value = ""; 
            } else { 
              document.getElementById('ddRoom').value = 'สถานที่อื่นๆ ภายใน สสจ.'; toggleRoomUI(); document.getElementById('otherRoom').value = loc; 
            }
          }
          
          document.getElementById('ddVeh').value = editData.Vehicle; 
          document.getElementById('remarkTxt').value = editData.Remark || "";

          const tickChk = (dataStr, cls, txtId) => { 
            let arr = dataStr.split(', '); 
            document.querySelectorAll(cls).forEach(c => { 
              if(arr.includes(c.value)) c.checked = true; 
              let otherItem = arr.find(a => a.startsWith('อื่นๆ')); 
              if(c.value === "อื่นๆ" && otherItem) { 
                c.checked = true; 
                document.getElementById(txtId).classList.remove('hidden'); 
                let match = otherItem.match(/\((.*?)\)/); 
                if(match) document.getElementById(txtId).value = match[1]; 
              } 
            }); 
          };
          
          tickChk(editData.Activities, '.chk-act', 'otherActTxt'); 
          tickChk(editData.PRChannels, '.chk-pr', 'otherPrTxt'); 
          tickChk(editData.Delivery, '.chk-del', 'otherDelTxt');
          
        } else {
          document.getElementById('formTitle').innerText = "สร้างคำขอใช้บริการ"; 
          document.getElementById('btnSubmitForm').innerText = "บันทึกส่งคำขอ"; 
          document.getElementById('btnSubmitForm').classList.replace('btn-warning', 'btn-success'); 
          document.getElementById('editId').value = "";
          
          document.getElementById('locIn').checked = true; 
          document.getElementById('ddRoom').selectedIndex = 0; 
          toggleLocUI(); toggleRoomUI();
          
          setTimeDropdown('startHH', 'startMM', '08', '00');
          setTimeDropdown('endHH', 'endMM', '09', '00');
          setTimeDropdown('depHH', 'depMM', '08', '00');
        }
      }

      // =====================================
      // ปิดฟอร์มกลับหน้าหลัก (โดยไม่โหลดตารางใหม่)
      // =====================================
      function closeFormWithoutReload() {
        // 1. ซ่อนหน้าฟอร์ม
        document.getElementById('reqFormSec').classList.add('hidden');
        
        // 2. โชว์หน้า Dashboard เดิมที่เคยโหลดไว้แล้ว (แยกตามสิทธิ์ผู้ใช้)
        if (currentUser.role === 'Admin') {
          document.getElementById('adminDash').classList.remove('hidden');
        } else {
          document.getElementById('userDash').classList.remove('hidden');
        }
        
        // 💡 สังเกตว่าเราไม่ใช้คำสั่ง loadUserDash() ตารางเก่าจึงยังอยู่ครบถ้วนและไม่กระตุกครับ
      }

      async function loadUserDash() {
        hideAllDash(); document.getElementById('userDash').classList.remove('hidden'); resetNavButtons();

        document.getElementById('userTableBody').innerHTML = `
          <tr>
            <td colspan="5" class="text-center text-muted py-5">
              <div class="spinner-border text-teal spinner-border-sm me-2" role="status"></div>
              กำลังโหลดข้อมูล...
            </td>
          </tr>
        `;
        
        const res = await api('getUserRequests', { username: currentUser.username }); 
        userRequestsData = res.data; 
        let tbody = '';
        
        // 📌 3. เช็คว่ามีข้อมูลหรือไม่ (ถ้าไม่มีให้แจ้งว่ายังไม่มีคำขอ)
        if (!res.data || res.data.length === 0) {
          tbody = `<tr><td colspan="5" class="text-center text-muted py-4">ยังไม่มีประวัติการขอใช้บริการ</td></tr>`;
        } else {
          // ถ้ามีข้อมูล ให้วนลูปสร้างตารางตามปกติ
          res.data.reverse().forEach((r) => { 
            let badge = r.Status === 'อนุมัติแล้ว' ? 'bg-success' : (r.Status === 'ยกเลิกแล้ว' ? 'bg-danger' : (r.Status === 'เสร็จสิ้น' ? 'bg-secondary' : 'bg-warning text-dark')); 
            let actBtns = `<button class="btn btn-sm btn-outline-warning mb-1 w-100" onclick="generatePDF('${r.RequestID}')"><i class="bi bi-printer"></i> PDF</button>`; 
            
            if(r.Status === 'รออนุมัติ') { 
              actBtns += `<button class="btn btn-sm btn-outline-warning mb-1 w-100" onclick="triggerEdit('${r.RequestID}')"><i class="bi bi-pencil"></i> แก้ไข</button> 
                          <button class="btn btn-sm btn-outline-danger mb-1 w-100" onclick="cancelReq('${r.RequestID}')"><i class="bi bi-x-circle"></i> ยกเลิก</button>`; 
            } else if (r.Status === 'เสร็จสิ้น') {
              actBtns += `<button class="btn btn-sm btn-success mb-1 w-100 shadow-sm" onclick="viewUserWorkResult('${r.RequestID}')"><i class="bi bi-images"></i> ดูผลงาน</button>`;
            }
            
            tbody += `<tr>
                        <td class="text-nowrap"><span class="badge ${badge}">${r.Status}</span><br><small class="text-muted">${r.RequestID}</small></td>
                        <td><b>${r.ProjectName}</b></td>
                        <td class="text-nowrap">${getThaiDateFull(r.EventDate)} <br><small class="text-muted">${fmtTime(r.StartTime)}-${fmtTime(r.EndTime)} น.</span></td>
                        <td>${r.Location || '-'}</td>
                        <td class="col-action text-center">${actBtns}</td>
                      </tr>`; 
          }); 
        }
        document.getElementById('userTableBody').innerHTML = tbody;
      }

      function viewUserWorkResult(id) {
        const req = userRequestsData.find(r => r.RequestID === id);
        if(!req) return;

        let linkHtml = "";
        if (req.SentLink && req.SentLink.trim() !== "-" && req.SentLink.trim() !== "") {
          linkHtml = `<a href="${req.SentLink}" target="_blank" class="btn btn-primary w-100 mt-3 py-2 fw-bold shadow-sm" style="border-radius: 8px;"><i class="bi bi-cloud-arrow-down-fill"></i> คลิกเปิดดูไฟล์ / ดาวน์โหลดผลงาน</a>`;
        } else {
          linkHtml = `<div class="alert alert-secondary text-center mt-3 mb-0 py-2"><i class="bi bi-info-circle"></i> ไม่มีลิงก์แนบไฟล์</div>`;
        }

        let html = `
          <div class="text-start" style="font-size: 0.95rem; line-height: 1.6;">
            <div class="mb-3 px-2"><b><i class="bi bi-person-video text-success"></i> ช่างภาพผู้รับผิดชอบ:</b> <span class="text-dark">${req.AssignedTo || '-'}</span></div>
            <div class="mb-3 p-3 bg-light border-start border-4 border-primary rounded shadow-sm"><b class="text-primary"><i class="bi bi-journal-text"></i> สรุปผลการปฏิบัติงาน:</b><br><span class="text-dark">${(req.WorkSummary || '-').replace(/\n/g, '<br>')}</span></div>
            <div class="mb-2 p-3 bg-light border-start border-4 border-warning rounded shadow-sm"><b class="text-warning text-darken"><i class="bi bi-exclamation-triangle"></i> ปัญหาและอุปสรรค:</b><br><span class="text-muted">${(req.Obstacles || '-').replace(/\n/g, '<br>')}</span></div>
            ${linkHtml}
          </div>
        `;
        Swal.fire({ title: 'รายละเอียดผลงาน', html: html, width: '500px', showCloseButton: true, confirmButtonText: 'ปิดหน้าต่าง', confirmButtonColor: '#6c757d' });
      }
      
      function triggerEdit(id) {
        const req = userRequestsData.find((r) => r.RequestID === id);
        if (req) showForm(req);
      }
      
      async function cancelReq(id) {
        if (confirm("ต้องการยกเลิกคำขอนี้ใช่หรือไม่?")) {
          await api("cancelRequest", { id });
          loadUserDash();
        }
      }

      function getFiscalYearRange() {
        const today = new Date();
        const currentMonth = today.getMonth(); 
        const currentYear = today.getFullYear();
        const startYear = currentMonth >= 9 ? currentYear : currentYear - 1;
        const fyStart = new Date(startYear, 9, 1); 
        const fyEnd = new Date(startYear + 1, 8, 30, 23, 59, 59); 
        const fyName = startYear + 1 + 543; 
        return { fyStart, fyEnd, fyName };
      }

      // =====================================
      // ADMIN DASHBOARD
      // =====================================
      async function loadAdminDash() { 
        hideAllDash(); document.getElementById('adminDash').classList.remove('hidden'); resetNavButtons(); 
        const res = await api('getAllRequests'); 
        
        if (res.status === 'success') { 
          allRequestsData = res.data.reverse(); 
          let newReq = 0, pending = 0, thisMonth = 0, thisFY = 0;
          const today = new Date();
          const fy = getFiscalYearRange();
          
          allRequestsData.forEach(r => {
            let evDate = new Date(r.EventDate);
            if (r.Status === 'รออนุมัติ') newReq++;
            if (r.Status === 'อนุมัติแล้ว') pending++; 
            if (evDate.getMonth() === today.getMonth() && evDate.getFullYear() === today.getFullYear() && r.Status !== 'ยกเลิกแล้ว') thisMonth++;
            if (evDate >= fy.fyStart && evDate <= fy.fyEnd && r.Status !== 'ยกเลิกแล้ว') thisFY++;
          });
          
          document.getElementById('adNewReq').innerText = newReq;
          document.getElementById('adPending').innerText = pending;
          document.getElementById('adThisMonth').innerText = thisMonth;
          document.getElementById('adThisFY').innerText = thisFY;
          document.getElementById('adFYText').innerText = `(ปีงบฯ ${fy.fyName})`;

          currentAdminPage = 1; 
          renderAdminTable(); 
        } 
      }

      async function refreshAdmin() {
        Swal.fire({ title: "กำลังโหลด...", didOpen: () => Swal.showLoading() });
        await loadAdminDash();
        Swal.close();
      }

      function searchAdmin() {
        currentAdminPage = 1;
        renderAdminTable();
      }

      function renderAdminTable() {
        const keyword = document.getElementById("adminSearch").value.toLowerCase();
        const filtered = allRequestsData.filter(
          (r) => r.ProjectName.toLowerCase().includes(keyword) || r.FullName.toLowerCase().includes(keyword) || r.Status.toLowerCase().includes(keyword) || r.RequestID.toLowerCase().includes(keyword)
        );
        const totalPages = Math.ceil(filtered.length / adminItemsPerPage) || 1;
        if (currentAdminPage > totalPages) currentAdminPage = totalPages;
        const pageData = filtered.slice((currentAdminPage - 1) * adminItemsPerPage, currentAdminPage * adminItemsPerPage);
        let tbody = "";
        
        if (pageData.length === 0) tbody = `<tr><td colspan="5" class="text-center text-muted py-4"><i class="bi bi-search"></i> ไม่พบข้อมูลที่ค้นหา</td></tr>`;
        else pageData.forEach((r) => {
            let badge = r.Status === "อนุมัติแล้ว" ? "bg-success" : r.Status === "ยกเลิกแล้ว" ? "bg-danger" : r.Status === "เสร็จสิ้น" ? "bg-secondary" : "bg-warning text-dark";
            let assignText = r.AssignedTo ? `<br><small class="text-primary"><i class="bi bi-person-check-fill"></i> ${r.AssignedTo}</small>` : "";
            let actBtn = r.Status === "รออนุมัติ"
                ? `<button class="btn btn-sm btn-success w-100 mb-1" onclick="promptApprove('${r.RequestID}')">อนุมัติ</button><button class="btn btn-sm btn-danger w-100" onclick="updateStatus('${r.RequestID}', 'ไม่อนุมัติ')">ปฏิเสธ</button>`
                : `<button class="btn btn-sm btn-outline-secondary w-100" onclick="generatePDF('${r.RequestID}')"><i class="bi bi-printer"></i> PDF</button>`;
            tbody += `<tr><td class="text-nowrap"><span class="badge ${badge}">${r.Status}</span><br><small class="text-muted">${r.RequestID}</small></td><td><b>${r.FullName}</b><br><small class="text-muted">${r.Department}</small></td><td><b>${r.ProjectName}</b><br><small><i class="bi bi-geo-alt"></i> ${r.Location || "-"}</small><br><small><i class="bi bi-calendar"></i> ${getThaiDateFull(r.EventDate)} (${fmtTime(r.StartTime)}-${fmtTime(r.EndTime)} น.)</small>${assignText}</td><td><small class="text-muted">${r.Activities}</small><br><span class="text-danger small">${r.Remark ? "หมายเหตุ: " + r.Remark : ""}</span></td><td class="col-action">${actBtn}</td></tr>`;
          });
        document.getElementById("adminTableBody").innerHTML = tbody;
        document.getElementById("adminPagination").innerHTML = `<button class="btn btn-sm btn-outline-teal me-2" ${currentAdminPage === 1 ? "disabled" : ""} onclick="changeAdminPage(${currentAdminPage - 1})">ก่อนหน้า</button><span class="align-self-center mx-2 small fw-bold">หน้า ${currentAdminPage} / ${totalPages}</span><button class="btn btn-sm btn-outline-teal ms-2" ${currentAdminPage === totalPages ? "disabled" : ""} onclick="changeAdminPage(${currentAdminPage + 1})">ถัดไป</button>`;
      }
      
      function changeAdminPage(page) { currentAdminPage = page; renderAdminTable(); }

      async function promptApprove(reqId) {
        let req = allRequestsData.find((r) => r.RequestID === reqId);
        let options = {};
        photographersList.forEach((p) => (options[p] = p));
        const { value: photographer } = await Swal.fire({
          title: "มอบหมายช่างภาพ", input: "select", inputOptions: options, inputPlaceholder: "-- เลือกช่างภาพ --", showCancelButton: true, confirmButtonText: "ยืนยัน", cancelButtonText: "ยกเลิก",
        });
        if (photographer) {
          let conflictMsg = "";
          globalApprovedEvents.forEach((ev) => {
            if (ev.assignedTo === photographer && ev.dateStr === new Date(req.EventDate).toISOString().split("T")[0]) {
              let reqStart = fmtTime(req.StartTime); let reqEnd = fmtTime(req.EndTime);
              if (reqStart < ev.endStr && reqEnd > ev.startStr) conflictMsg += `<br><b class="text-danger">- ${ev.projectName} (${ev.startStr} - ${ev.endStr})</b>`;
            }
          });
          if (conflictMsg !== "") {
            const cf = await Swal.fire({ title: "คิวช่างภาพซ้อนทับ!", html: `<b>${photographer}</b> มีคิวงานแล้ว:${conflictMsg}<br><br>ยืนยันที่จะอนุมัติให้ช่างภาพคนนี้หรือไม่?`, icon: "warning", showCancelButton: true, confirmButtonText: "ยืนยันอนุมัติ", cancelButtonText: "ยกเลิก", });
            if (!cf.isConfirmed) return;
          }
          Swal.fire({ title: "กำลังบันทึก...", didOpen: () => Swal.showLoading() });
          await api("updateStatus", { id: reqId, status: "อนุมัติแล้ว", assignedTo: photographer });
          Swal.fire("เรียบร้อย", "อัปเดตสำเร็จ", "success");
          loadAdminDash();
        }
      }

      async function updateStatus(id, status) {
        Swal.fire({ title: "กำลังดำเนินการ...", didOpen: () => Swal.showLoading() });
        await api("updateStatus", { id, status });
        Swal.fire("เรียบร้อย", "ปฏิเสธสำเร็จ", "success");
        loadAdminDash();
      }

      async function testCalendarConnection() {
        Swal.fire({ title: "ตรวจสอบปฏิทิน...", didOpen: () => Swal.showLoading() });
        const res = await api("checkCalendarConnection");
        res.status === "success" ? Swal.fire("สำเร็จ!", `ปฏิทิน: ${res.calendarName}`, "success") : Swal.fire("ล้มเหลว", res.message, "error");
      }

      async function testDriveConnection() {
        Swal.fire({ title: "ตรวจสอบ...", didOpen: () => Swal.showLoading() });
        const res = await api("checkDriveConnection");
        res.status === "success" ? Swal.fire({ icon: "success", title: "เชื่อมต่อสำเร็จ!", html: `<b>โฟลเดอร์:</b> ${res.folderName}<br><a href="${res.folderUrl}" target="_blank" class="btn btn-sm btn-info mt-3 text-white">เปิดดูโฟลเดอร์</a>`, }) : Swal.fire("ล้มเหลว", res.message, "error");
      }

      // =====================================
      // PHOTOGRAPHER DASHBOARD
      // =====================================
      async function showPhotoDash() { 
        hideAllDash(); document.getElementById('photoDash').classList.remove('hidden'); setPhotoNavButton();
        Swal.fire({title: 'กำลังโหลดงาน...', didOpen: () => Swal.showLoading()});
        const res = await api('getAllRequests'); 
        if(res.status === 'success') {
          allRequestsData = res.data; let tbody = '';
          const myJobs = res.data.filter(r => r.AssignedTo === currentUser.name && (r.Status === 'อนุมัติแล้ว' || r.Status === 'เสร็จสิ้น')).reverse();
          
          if(myJobs.length === 0) tbody = `<tr><td colspan="5" class="text-center text-muted py-4">ยังไม่มีงานที่ได้รับมอบหมาย</td></tr>`;
          else myJobs.forEach(r => {
            let actBtn = r.Status === 'เสร็จสิ้น' 
              ? `<button class="btn btn-sm btn-info text-white w-100 shadow-sm fw-bold" onclick="viewWorkLog('${r.RequestID}')"><i class="bi bi-search"></i> ดูบันทึก</button>` 
              : `<button class="btn btn-sm btn-warning w-100 shadow-sm fw-bold" onclick="openWorkLog('${r.RequestID}')"><i class="bi bi-pencil-square"></i> บันทึกงาน</button>`;
            
            tbody += `<tr><td class="text-nowrap"><span class="badge ${r.Status==='เสร็จสิ้น'?'bg-secondary':'bg-success'}">${r.Status}</span><br><small class="text-muted">${r.RequestID}</small></td><td><b>${r.ProjectName}</b><br><small><i class="bi bi-geo-alt"></i> ${r.Location||'-'}</small></td><td class="text-nowrap">${getThaiDateFull(r.EventDate)}<br><small>${fmtTime(r.StartTime)}-${fmtTime(r.EndTime)} น.</small></td><td><small>${r.Activities}</small></td><td class="col-action">${actBtn}</td></tr>`;
          });
          document.getElementById('photoTableBody').innerHTML = tbody; Swal.close();
        }
      }

      function openWorkLog(id) { 
        document.getElementById('wlReqId').value = id; 
        document.getElementById('wlSummary').value = ""; document.getElementById('wlSummary').readOnly = false;
        document.getElementById('wlObstacles').value = ""; document.getElementById('wlObstacles').readOnly = false;
        document.getElementById('wlSentLink').value = ""; document.getElementById('wlSentLink').readOnly = false;
        document.getElementById('wlEmailDiv').classList.remove('hidden');
        document.getElementById('btnSaveWorkLog').classList.remove('hidden');
        new bootstrap.Modal(document.getElementById('workLogModal')).show(); 
      }

      function viewWorkLog(id) {
        let req = allRequestsData.find(r => r.RequestID === id);
        if(!req) return;
        document.getElementById('wlReqId').value = id; 
        document.getElementById('wlSummary').value = req.WorkSummary || "-"; document.getElementById('wlSummary').readOnly = true;
        document.getElementById('wlObstacles').value = req.Obstacles || "-"; document.getElementById('wlObstacles').readOnly = true;
        document.getElementById('wlSentLink').value = req.SentLink || "-"; document.getElementById('wlSentLink').readOnly = true;
        document.getElementById('wlEmailDiv').classList.add('hidden');
        document.getElementById('btnSaveWorkLog').classList.add('hidden');
        new bootstrap.Modal(document.getElementById('workLogModal')).show(); 
      }
      
      async function submitWorkLog() {
        const id = document.getElementById('wlReqId').value, sum = document.getElementById('wlSummary').value, obs = document.getElementById('wlObstacles').value, lnk = document.getElementById('wlSentLink').value, mail = document.getElementById('wlSendEmail').checked;
        if(!sum) return Swal.fire('แจ้งเตือน', 'กรุณาระบุสรุปการปฏิบัติงาน', 'warning');
        bootstrap.Modal.getInstance(document.getElementById('workLogModal')).hide();
        Swal.fire({title: 'กำลังบันทึกและส่งอีเมล...', didOpen: () => Swal.showLoading()});
        const res = await api('submitWorkLog', { id: id, summary: sum, obstacles: obs, sentLink: lnk, sendEmail: mail });
        res.status === 'success' ? Swal.fire('เรียบร้อย', 'บันทึกงานเสร็จสิ้น', 'success').then(() => showPhotoDash()) : Swal.fire('ผิดพลาด', res.message, 'error');
      }

      // =====================================
      // บันทึกฟอร์ม (Submit Form)
      // =====================================
// =====================================
  // บันทึกฟอร์ม (Submit Form) - ปรับปรุงเพื่อป้องกันการกดซ้ำ
  // =====================================
  document.getElementById('serviceForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    // 1. แจ้งเตือนยืนยันก่อนเริ่มทำงาน (ป้องกันการกดพลาด)
    const isEdit = document.getElementById('editId').value !== "";
    const confirmTitle = isEdit ? 'ยืนยันการแก้ไขข้อมูล' : 'ยืนยันการส่งคำขอ';
    
    // 2. ปิดปุ่มบันทึกทันที และแสดง Loading เพื่อไม่ให้กดซ้ำ (Prevent Double Click)
    const btnSubmit = document.getElementById('btnSubmitForm');
    btnSubmit.disabled = true;
    const originalBtnText = btnSubmit.innerText;
    btnSubmit.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> กำลังบันทึก...`;

    Swal.fire({
      title: 'กำลังบันทึกข้อมูล...',
      html: 'กรุณารอสักครู่ ระบบกำลังอัปเดตข้อมูลไปยังฐานข้อมูล',
      allowOutsideClick: false,
      didOpen: () => { Swal.showLoading(); }
    });

    try {
      const reqDate = document.getElementById('eventDate').value;
      const reqStart = `${document.getElementById('startHH').value}:${document.getElementById('startMM').value}`;
      const reqEnd = `${document.getElementById('endHH').value}:${document.getElementById('endMM').value}`;
      
      const getVals = (cls, txtId) => { 
        let arr = []; 
        document.querySelectorAll(cls+':checked').forEach(c => arr.push(c.value === "อื่นๆ" ? `อื่นๆ (${document.getElementById(txtId).value})` : c.value)); 
        return arr.join(', '); 
      };
      
      const acts = getVals('.chk-act', 'otherActTxt');
      const prs = getVals('.chk-pr', 'otherPrTxt');
      const dels = getVals('.chk-del', 'otherDelTxt');
      
      if(!acts || !prs || !dels) {
        btnSubmit.disabled = false; // เปิดปุ่มคืน
        btnSubmit.innerText = originalBtnText;
        return Swal.fire('แจ้งเตือน','กรุณาเลือก กิจกรรม/ช่องทาง/การส่งกลับ อย่างน้อย 1 ข้อ','warning');
      }

      // ตรวจสอบคิวซ้อน (เรียก API สดๆ เพื่อความแม่นยำ)
      let conflictMsg = ""; 
      const editId = document.getElementById('editId').value;
      const checkRes = await api("getApprovedEvents", { start: reqDate, end: reqDate });
      
      if (checkRes.status === 'success') {
        const dayEvents = checkRes.data.filter(ev => ev.dateStr === reqDate && ev.id !== editId);
        dayEvents.forEach(ev => { 
          if(reqStart < ev.endStr && reqEnd > ev.startStr) {
            conflictMsg += `<br><b class="text-danger">- ${ev.projectName} (${ev.startStr} - ${ev.endStr})</b>`; 
          }
        });
      }

      if(conflictMsg !== "") { 
        Swal.close(); // ปิด loading ชั่วคราวเพื่อโชว์เตือนคิวซ้อน
        const cf = await Swal.fire({ 
          title: 'เวลาซ้อนทับ!', 
          html: `คิวงานที่อนุมัติแล้ว:${conflictMsg}<br><br>ยืนยันที่จะบันทึกเพื่อรอพิจารณาหรือไม่?`, 
          icon: 'warning', 
          showCancelButton: true, 
          confirmButtonText: 'ยืนยันบันทึก', 
          cancelButtonText: 'แก้ไขเวลา' 
        }); 
        if(!cf.isConfirmed) {
          btnSubmit.disabled = false; // เปิดปุ่มคืน
          btnSubmit.innerText = originalBtnText;
          return;
        }
        // ถ้ากดยืนยันคิวซ้อน ให้โชว์ loading ต่อ
        Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
      }

      // จัดการข้อมูลสถานที่
      let locType = document.querySelector('input[name="locType"]:checked').value, finalLoc = "", finalVeh = "", finalDepTime = "";
      if (locType === "ใน สสจ.") { 
        let rm = document.getElementById('ddRoom').value; 
        finalLoc = (rm === 'สถานที่อื่นๆ ภายใน สสจ.') ? document.getElementById('otherRoom').value : rm; 
        finalVeh = "ไม่ใช้ยานพาหนะ"; 
      } else { 
        finalLoc = document.getElementById('outLocation').value; finalVeh = document.getElementById('ddVeh').value; 
        let dH = document.getElementById('depHH').value, dM = document.getElementById('depMM').value;
        finalDepTime = (dH && dM) ? `${dH}:${dM}` : ""; 
      }

      let payload = {
        id: editId, 
        username: currentUser.username, fullName: currentUser.name, position: currentUser.pos, 
        department: currentUser.dept, phone: currentUser.phone, email: currentUser.email,
        projectName: document.getElementById('projectName').value, eventDate: reqDate, 
        startTime: reqStart, endTime: reqEnd, locationType: locType, location: finalLoc, 
        vehicle: finalVeh, depTime: finalDepTime, activities: acts, prChannels: prs, delivery: dels, 
        remark: document.getElementById('remarkTxt').value
      };

      const file = document.getElementById('fileUpload').files[0];
      if(file) { 
        if(file.size > 5 * 1024 * 1024) {
          btnSubmit.disabled = false; btnSubmit.innerText = originalBtnText;
          return Swal.fire('ผิดพลาด', 'ไฟล์เกิน 5MB', 'error');
        }
        const reader = new FileReader(); 
        reader.onload = async function(e) { 
          payload.fileData = { filename: file.name, mimeType: file.type, bytes: e.target.result.split(',')[1] }; 
          await execForm(payload, btnSubmit, originalBtnText); 
        }; 
        reader.readAsDataURL(file); 
      } else { 
        await execForm(payload, btnSubmit, originalBtnText); 
      }

    } catch (err) {
      console.error(err);
      Swal.fire('ผิดพลาด', 'เกิดข้อผิดพลาดในการบันทึก: ' + err, 'error');
      btnSubmit.disabled = false; btnSubmit.innerText = originalBtnText;
    }
  });
  
  // =====================================
  // ฟังก์ชันส่งข้อมูล (ปรับปรุงเพื่อจัดการปุ่ม)
  // =====================================
  async function execForm(payload, btnElement, originalText) { 
    try {
      const res = await api(payload.id ? 'updateRequest' : 'submitRequest', payload); 
      if (res.status === 'success') {
        Swal.fire({
          title : 'สำเร็จ', 
          text : 'บันทึกข้อมูลเรียบร้อยแล้ว',
          icon : 'success', 
          showConfirmButton : false,
          timer: 1500}
        ).then(() => { 
          currentUser.role === 'Admin' ? loadAdminDash() : loadUserDash(); 
        });
      } else {
        Swal.fire('ผิดพลาด', res.message, 'error'); 
        btnElement.disabled = false; btnElement.innerText = originalText;
      }
    } catch (e) {
      Swal.fire('ผิดพลาด', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
      btnElement.disabled = false; btnElement.innerText = originalText;
    }
  }

      // =====================================
      // PDF EXPORT
      // =====================================
      function generatePDF(id) {
        let req = allRequestsData.find((r) => r.RequestID === id) || userRequestsData.find((r) => r.RequestID === id);
        if (!req) return Swal.fire("ข้อผิดพลาด", "ไม่พบข้อมูลคำขอ", "error");
        Swal.fire({ title: "กำลังสร้างตัวอย่าง...", didOpen: () => Swal.showLoading() });
        const checkedIcon = "☑", uncheckIcon = "☐";

        document.getElementById("pdfReqId").innerText = req.RequestID;
        document.getElementById("pdfDateTop").innerText = getThaiDateFull(new Date());
        document.getElementById("pdfName").innerText = req.FullName;
        document.getElementById("pdfPos").innerText = req.Position || "-";
        document.getElementById("pdfDept").innerText = req.Department;

        let phoneStr = req.Phone ? String(req.Phone).trim() : '-';
        if (/^\d{9}$/.test(phoneStr)) phoneStr = '0' + phoneStr; 
        if (/^\d{10}$/.test(phoneStr)) phoneStr = phoneStr.replace(/(\d{3})(\d{4})(\d{3})/, '$1-$2-$3');
        else if (/^\d{11}$/.test(phoneStr)) phoneStr = phoneStr.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
        
        document.getElementById('pdfPhone').innerText = phoneStr;
        document.getElementById("pdfProj").innerText = req.ProjectName;
        document.getElementById("pdfDate").innerText = getThaiDateFull(req.EventDate);
        document.getElementById("pdfStartTime").innerText = fmtTime(req.StartTime);
        document.getElementById("pdfEndTime").innerText = fmtTime(req.EndTime);
        document.getElementById("pdfLocation").innerText = req.Location || "สสจ.ลพบุรี";

        if (req.Vehicle && req.Vehicle.includes("ส่วนตัว")) document.getElementById("chkVehPrivate").innerHTML = checkedIcon;
        else document.getElementById("chkVehPrivate").innerHTML = uncheckIcon;
        if (req.Vehicle && req.Vehicle.includes("สสจ.")) {
          document.getElementById("chkVehOffice").innerHTML = checkedIcon;
          document.getElementById("pdfDepTime").innerText = fmtTime(req.DepTime) || "-";
        } else {
          document.getElementById("chkVehOffice").innerHTML = uncheckIcon;
          document.getElementById("pdfDepTime").innerText = "";
        }

        const genDynCol = (arrDb, reqStr) => {
          let html = "";
          arrDb.forEach((item) => {
            let isChked = reqStr.includes(item) ? checkedIcon : uncheckIcon;
            if (item === "อื่นๆ") { let match = reqStr.match(/อื่นๆ \((.*?)\)/); html += `<div style="display: inline-block; width: 100%; margin-bottom: 3px;">${isChked} อื่นๆ ${match ? match[1] : ""}</div>`; } 
            else { html += `<div style="display: inline-block; width: 49%; margin-bottom: 3px;">${isChked} ${item}</div>`; }
          }); return html;
        };
        const genDynRow = (arrDb, reqStr) => {
          let html = "";
          arrDb.forEach((item) => {
            let isChked = reqStr.includes(item) ? checkedIcon : uncheckIcon;
            if (item === "อื่นๆ") { let match = reqStr.match(/อื่นๆ \((.*?)\)/); html += `<span style="margin-right: 15px;">${isChked} อื่นๆ ${match ? match[1] : ""}</span>`; } 
            else { html += `<span style="margin-right: 15px;">${isChked} ${item}</span>`; }
          }); return html;
        };

        document.getElementById("pdfDynActivities").innerHTML = genDynCol(globalActivities, req.Activities || "");
        document.getElementById("pdfDynPRChannels").innerHTML = genDynRow(globalPRChannels, req.PRChannels || "");
        document.getElementById("pdfDynDeliveries").innerHTML = genDynRow(globalDeliveries, req.Delivery || "");
        document.getElementById("pdfRemarkStr").innerText = req.Remark || "-";
        document.getElementById("pdfSignName").innerText = req.FullName;

        const element = document.getElementById("pdfTemplate");
        const fileName = `${req.RequestID}_${req.FullName}.pdf`;

        html2pdf().set({ margin: 0, fileName, image: { type: "jpeg", quality: 1 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: "mm", format: "a4", orientation: "portrait", compress: true } })
          .from(element).outputPdf("bloburl").then((pdfUrl) => {
            document.getElementById('pdfPreviewFrame').src = pdfUrl ; 
            const modalFooter = document.querySelector('#pdfPreviewModal .modal-footer');
            if (modalFooter) {
              modalFooter.innerHTML = `<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">ปิดหน้าต่าง</button><button type="button" class="btn btn-primary fw-bold" onclick="downloadCustomPDF('${pdfUrl}', '${fileName}')"><i class="bi bi-download"></i> ดาวน์โหลด PDF</button>`;
            }
            Swal.close();
            new bootstrap.Modal(document.getElementById("pdfPreviewModal")).show();
          }).catch((err) => { Swal.fire("ผิดพลาด", "สร้าง PDF ไม่ได้", "error"); });
      }

      function downloadCustomPDF(url, fileName) {
        const a = document.createElement('a'); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); document.body.removeChild(a);
      }

      // =====================================
      // Smart Time Sync
      // =====================================
      function setTimeDropdown(hhId, mmId, hhVal, mmVal) {
        let hh = document.getElementById(hhId); let mm = document.getElementById(mmId);
        if(hh && mm) { hh.value = hhVal; mm.value = mmVal; }
      }

      function syncEndTimes() {
        let stHH = document.getElementById('startHH').value; let stMM = document.getElementById('startMM').value;
        let enHH = document.getElementById('endHH'); let enMM = document.getElementById('endMM');
        
        if(!stHH || !stMM) return;
        let startTotalMins = (parseInt(stHH) * 60) + parseInt(stMM);
        let endTotalMins = 0;
        if(enHH.value && enMM.value) endTotalMins = (parseInt(enHH.value) * 60) + parseInt(enMM.value);

        if (!enHH.value || !enMM.value || endTotalMins <= startTotalMins) {
          let newEndMins = startTotalMins + 60; 
          if (newEndMins > (23 * 60 + 45)) newEndMins = (23 * 60 + 45); 
          let newHH = Math.floor(newEndMins / 60).toString().padStart(2, '0');
          let newMM = (newEndMins % 60).toString().padStart(2, '0');
          setTimeDropdown('endHH', 'endMM', newHH, newMM);
        }
      }

      document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('startHH').addEventListener('change', syncEndTimes);
        document.getElementById('startMM').addEventListener('change', syncEndTimes);
        
        const checkEndTimeLogic = () => {
          let stHH = document.getElementById('startHH').value; let stMM = document.getElementById('startMM').value;
          let enHH = document.getElementById('endHH').value; let enMM = document.getElementById('endMM').value;
          
          if(stHH && stMM && enHH && enMM) {
            let startTotalMins = (parseInt(stHH) * 60) + parseInt(stMM);
            let endTotalMins = (parseInt(enHH) * 60) + parseInt(enMM);
            if (endTotalMins <= startTotalMins) {
              Swal.fire({ icon: 'warning', title: 'ระบุเวลาไม่ถูกต้อง', text: 'เวลาสิ้นสุด ต้องมากกว่าเวลาเริ่มต้น', confirmButtonColor: '#0f766e' }).then(() => { syncEndTimes(); });
            }
          }
        };

        document.getElementById('endHH').addEventListener('change', checkEndTimeLogic);
        document.getElementById('endMM').addEventListener('change', checkEndTimeLogic);
      });

      // =====================================
      // ระบบลืมรหัสผ่าน
      // =====================================
      function toggleForgotBox() {
        document.getElementById("loginBox").classList.toggle("hidden");
        document.getElementById("forgotBox").classList.toggle("hidden");
        // ซ่อนหน้าลงทะเบียนไว้เสมอ เผื่อเปิดค้างไว้
        document.getElementById("regBox").classList.add("hidden"); 
      }

      async function submitForgotPassword() {
        const inputVal = document.getElementById("forgotInput").value.trim();
        if (!inputVal) return Swal.fire("แจ้งเตือน", "กรุณากรอก Username หรือ อีเมล", "warning");

        Swal.fire({
          title: "กำลังค้นหาข้อมูล...",
          html: "ระบบกำลังสร้างรหัสผ่านใหม่และส่งอีเมล",
          allowOutsideClick: false,
          didOpen: () => Swal.showLoading(),
        });

        try {
          const res = await api("resetPassword", { identity: inputVal });
          if (res.status === "success") {
            Swal.fire("สำเร็จ!", res.message, "success").then(() => {
              toggleForgotBox(); // กลับไปหน้าล็อกอิน
              document.getElementById("forgotInput").value = "";
            });
          } else {
            Swal.fire("ข้อผิดพลาด", res.message, "error");
          }
        } catch (e) {
          Swal.fire("ข้อผิดพลาด", "ไม่สามารถเชื่อมต่อระบบได้", "error");
        }
      }

      // =====================================
      // ระบบลงทะเบียนผู้ใช้ใหม่ (Register)
      // =====================================
      document.getElementById('regForm').addEventListener('submit', async function(e) {
        e.preventDefault(); // ป้องกันหน้าเว็บรีเฟรช

        // ดึงปุ่มมาเปลี่ยนสถานะเป็น Loading ไม่ให้กดซ้ำ
        const btnSubmit = this.querySelector('button[type="submit"]');
        const originalText = btnSubmit.innerText;
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> กำลังบันทึกข้อมูล...`;

        // รวบรวมข้อมูลจากฟอร์ม (อ้างอิงจาก name ใน HTML)
        const payload = {
          username: this.username.value.trim(),
          password: this.password.value,
          fullName: this.fullName.value.trim(),
          position: this.position.value,
          department: this.department.value,
          phone: this.phone.value.trim(),
          email: this.email.value.trim(),
          lineUID: currentLineUID // ถ้าเข้ามาทาง LINE จะมีตัวแปรนี้ติดไปผูกบัญชีด้วย
        };

        Swal.fire({
          title: "กำลังลงทะเบียน...",
          html: "ระบบกำลังบันทึกข้อมูลของคุณลงฐานข้อมูล",
          allowOutsideClick: false,
          didOpen: () => Swal.showLoading(),
        });

        try {
          // ส่งข้อมูลไปให้หลังบ้าน (Code.gs)
          const res = await api("registerUser", payload); 
          
          if (res.status === "success") {
            Swal.fire("สำเร็จ!", "ลงทะเบียนเรียบร้อยแล้ว<br>กรุณาเข้าสู่ระบบ", "success").then(() => {
              this.reset(); // ล้างข้อมูลในฟอร์ม
              toggleAuth(); // สลับหน้าจอกลับไปที่กล่องล็อกอิน
            });
          } else {
            Swal.fire("ข้อผิดพลาด", res.message || "ไม่สามารถลงทะเบียนได้", "error");
          }
        } catch (error) {
          console.error("Register Error:", error);
          Swal.fire("ข้อผิดพลาด", "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้", "error");
        } finally {
          // คืนค่าปุ่มกลับมาเหมือนเดิม เผื่อเกิด Error แล้วต้องกดใหม่
          btnSubmit.disabled = false;
          btnSubmit.innerText = originalText;
        }
      });

## Maximo Automation Script (`EXEC_SQL`)

Đoạn script Jython dưới đây chạy trực tiếp trên Maximo Automation Script (không cần Launch Point) để nhận câu lệnh SQL từ Web Console, thực thi trực tiếp xuống CSDL Oracle/DB2/SQL Server và trả về kết quả dạng JSON.

```python
from psdi.server import MXServer
import java.sql.Types as Types

# Hàm escape ký tự đặc biệt để bảo vệ chuỗi JSON không bị vỡ cú pháp
def escape_str(s):
    if s is None:
        return u""
    u_str = unicode(s)
    return (u_str.replace(u'\\', u'\\\\')
                 .replace(u'"', u'\\"')
                 .replace(u'\n', u'\\n')
                 .replace(u'\r', u'\\r')
                 .replace(u'\t', u'\\t'))

# Hàm xử lý an toàn các kiểu dữ liệu đặc biệt (BLOB, CLOB, Binary)
def get_column_value(rs, md, col_idx):
    col_type = md.getColumnType(col_idx)
    
    # 1. Xử lý cột dữ liệu Nhị phân (BLOB / Binary)
    if col_type in [Types.BLOB, Types.BINARY, Types.VARBINARY, Types.LONGVARBINARY]:
        return u"<BLOB>"
        
    # 2. Xử lý cột Văn bản dài (CLOB / NCLOB)
    elif col_type in [Types.CLOB, Types.NCLOB, Types.LONGVARCHAR]:
        try:
            clob = rs.getClob(col_idx)
            if clob is None:
                return u""
            length = int(min(clob.length(), 4000))
            return clob.getSubString(1, length)
        except Exception:
            return u"<CLOB>"
            
    # 3. Xử lý các kiểu dữ liệu tiêu chuẩn (String, Number, Date,...)
    else:
        try:
            val = rs.getString(col_idx)
            return val if val is not None else u""
        except Exception:
            try:
                obj = rs.getObject(col_idx)
                return unicode(obj) if obj is not None else u""
            except Exception:
                return u"<DATA>"

# =========================================================================
# LUỒNG XỬ LÝ CHÍNH (MAIN EXECUTION)
# =========================================================================

# Lấy dữ liệu SQL gửi từ HTTP Request Body
sql = requestBody if 'requestBody' in globals() and requestBody else ""

if not sql or sql.strip() == "":
    responseBody = u'{"success": false, "error": "SQL query is empty!"}'
else:
    dbManager = MXServer.getMXServer().getDBManager()
    con = None
    stmt = None
    rs = None

    try:
        con = dbManager.getSequenceConnection()
        stmt = con.createStatement()

        cleanSql = sql.strip().rstrip(';')
        upperSql = cleanSql.upper()

        # 1. Xử lý lệnh COMMIT
        if upperSql == "COMMIT":
            con.commit()
            responseBody = u'{"success": true, "action": "EXECUTE", "message": "Đã COMMIT giao dịch thành công!"}'

        # 2. Xử lý lệnh ROLLBACK
        elif upperSql == "ROLLBACK":
            con.rollback()
            responseBody = u'{"success": true, "action": "EXECUTE", "message": "Đã ROLLBACK giao dịch thành công!"}'

        # 3. Xử lý câu lệnh TRUY VẤN (SELECT / WITH CTE)
        elif upperSql.startswith("SELECT") or upperSql.startswith("WITH"):
            rs = stmt.executeQuery(cleanSql)
            md = rs.getMetaData()
            colCount = md.getColumnCount()

            rows = []
            while rs.next():
                fields = []
                for i in range(1, colCount + 1):
                    colName = unicode(md.getColumnName(i)).lower()
                    val = get_column_value(rs, md, i)
                    fields.append(u'"' + colName + u'":"' + escape_str(val) + u'"')
                rows.append(u"{" + u",".join(fields) + u"}")

            responseBody = u'{"success": true, "action": "SELECT", "data": [' + u",".join(rows) + u']}'

        # 4. Xử lý câu lệnh DML (UPDATE / INSERT / DELETE)
        else:
            count = stmt.executeUpdate(cleanSql)
            con.commit()
            responseBody = u'{"success": true, "action": "EXECUTE", "message": "Affected rows: ' + unicode(count) + u'"}'

    except Exception, e:
        responseBody = u'{"success": false, "error": "' + escape_str(str(e)) + u'"}'

    finally:
        # Giải phóng tài nguyên kết nối CSDL
        if rs:
            try: rs.close()
            except: pass
        if stmt:
            try: stmt.close()
            except: pass
        if con:
            try: con.close()
            except: pass

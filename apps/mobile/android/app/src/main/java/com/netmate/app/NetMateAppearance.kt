package com.netmate.app

import android.animation.ValueAnimator
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.*
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.LayerDrawable
import android.graphics.drawable.RippleDrawable
import android.graphics.drawable.StateListDrawable
import android.util.AttributeSet
import android.view.Gravity
import android.view.InputDevice
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.animation.AnimationUtils
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin

/**
 * 校园一卡通 tokens from apps/native-ui/src/netmate.css and design/netmate-card.html. All drawing uses platform
 * primitives on the software Canvas; only the day/night toggle animates, and only while a transition runs.
 */
internal class NetMateAppearance(var dark: Boolean, private val density: Float) {
    /** --ground */
    val background get() = color(if(dark) "#14181c" else "#ecebe6")
    /** --field: buttons, inputs, dropdowns and the log level segments. */
    val fieldFill get() = color(if(dark) "#1b2026" else "#f6f5f1")
    /** --line: hairlines between rows and control borders. */
    val line get() = color(if(dark) "#2a3138" else "#d6d4cd")
    /** --ink / --text: section rules and body text. */
    val text get() = color(if(dark) "#e8e6df" else "#1d2329")
    val ink get() = text
    /** --text-2 */
    val secondary get() = color(if(dark) "#9aa1a7" else "#5c636a")
    val faint get() = color(if(dark) "#3a434c" else "#b5b2aa")
    val gold get() = color(if(dark) "#d9b85e" else "#c9a24a")
    val goldText get() = color(if(dark) "#d9b85e" else "#87661c")
    val success get() = color(if(dark) "#5cc795" else "#2f7d5b")
    val warning get() = color(if(dark) "#e8a94e" else "#9a5f0c")
    val danger get() = color(if(dark) "#f07b6e" else "#b8372b")
    /** --rail: the top bar and the tab bar stay graphite in both themes. */
    val rail get() = color(if(dark) "#0d1013" else "#1d2329")
    val rail2 get() = color(if(dark) "#1d2329" else "#2b333b")
    val railText get() = color("#e8e6df")
    val railText2 get() = color("#9aa1a7")
    val faceA get() = color(if(dark) "#323d47" else "#26313b")
    val faceB get() = color(if(dark) "#232a32" else "#1a2128")
    val faceText get() = color("#f1efe8")
    val faceText2 get() = color("#a9afb5")
    val deck1 get() = color(if(dark) "#262c33" else "#cfcdc6")
    val deck2 get() = color(if(dark) "#1f252b" else "#dddbd5")
    /** --primary: ink by day, gold by night. */
    val primary get() = color(if(dark) "#d9b85e" else "#1d2329")
    val onPrimary get() = if(dark) color("#1a1606") else Color.WHITE
    fun dp(value: Int) = (value*density+.5f).toInt()
    fun px(value: Float) = (value*density+.5f).toInt()
    fun alpha(value: Int, alpha: Int) = (value and 0x00ffffff) or (alpha shl 24)
    fun weight(value: Int): Typeface = Typeface.create(Typeface.DEFAULT, value, false)
    fun rounded(radius: Float, fill: Int, stroke: Int? = null, strokeWidth: Float = 1f): GradientDrawable = GradientDrawable().apply {
        cornerRadius=radius*density; setColor(fill); if(stroke!=null) setStroke((strokeWidth*density+.5f).toInt().coerceAtLeast(1), stroke)
    }
    /** The mask keeps the ripple visible on transparent buttons. */
    fun pressable(shape: Drawable, radius: Float = 8f, ripple: Int = alpha(text, 0x1f)): Drawable = RippleDrawable(ColorStateList.valueOf(ripple), shape, rounded(radius, Color.WHITE))
    /** entry: field fill and a line border; focus turns the border gold. */
    fun input(radius: Float = 8f): Drawable = StateListDrawable().apply {
        addState(intArrayOf(android.R.attr.state_focused), rounded(radius, fieldFill, gold))
        addState(intArrayOf(), rounded(radius, fieldFill, line))
    }
    /** Hairline under a row. */
    fun bottomLine(): Drawable = edge(Gravity.BOTTOM, line, 1f)
    fun topLine(): Drawable = edge(Gravity.TOP, line, 1f)
    fun startLine(): Drawable = LayerDrawable(arrayOf<Drawable>(ColorDrawable(line))).apply { setLayerGravity(0, Gravity.START or Gravity.FILL_VERTICAL); setLayerWidth(0, dp(1)) }
    /** .panel-head: 1.5dp ink rule under a section title. */
    fun rule(): Drawable = edge(Gravity.BOTTOM, ink, 1.5f)
    /** .metrics and the log list: 1.5dp ink rule on top. */
    fun inkTop(): Drawable = edge(Gravity.TOP, ink, 1.5f)
    private fun edge(side: Int, color: Int, width: Float): Drawable = LayerDrawable(arrayOf<Drawable>(ColorDrawable(color))).apply { setLayerGravity(0, side or Gravity.FILL_HORIZONTAL); setLayerHeight(0, px(width).coerceAtLeast(1)) }
    /** Dropdown face: input look with a chevron; open = gold border and the chevron turned up. */
    fun dropdown(expanded: Boolean): Drawable {
        val face = rounded(8f, fieldFill, if(expanded) gold else line)
        val arrow = NetMateIcon("chevron", if(expanded) goldText else secondary, dp(16), if(expanded) 180f else 0f)
        return LayerDrawable(arrayOf<Drawable>(pressable(face), arrow)).apply {
            setLayerGravity(1, Gravity.END or Gravity.CENTER_VERTICAL); setLayerInsetEnd(1, dp(10)); setLayerSize(1, dp(16), dp(16))
        }
    }
    /** Dropdown popup: field, radius 10, line border, 5dp inner padding. */
    fun popup(): Drawable = rounded(10f, fieldFill, line).apply { setPadding(dp(5), dp(5), dp(5), dp(5)) }
    fun background(): Drawable = ColorDrawable(background)
    fun topBar(): Drawable = ColorDrawable(rail)
    /** Tab bar: rail with a white 8% hairline on top, as the rail separators. */
    fun tabBar(): Drawable = LayerDrawable(arrayOf<Drawable>(ColorDrawable(rail), ColorDrawable(0x14ffffff))).apply { setLayerGravity(1, Gravity.TOP or Gravity.FILL_HORIZONTAL); setLayerHeight(1, dp(1)) }
    /** Selected tab: rail-2 block, radius 8. */
    fun tab(active: Boolean): Drawable = pressable(rounded(8f, if(active) rail2 else Color.TRANSPARENT), 8f, 0x1fffffff)
    fun brand(): Drawable = BrandCard(density)
    /** .id-card face; [void] is the dashed outline. Radii are in pixels, since the deck scales them with the card. */
    fun face(void: Boolean, radius: Float): Drawable = CardFace(void, faceA, faceB, faint, radius, density)
    fun stripe(fraction: Float, radius: Float): Drawable = Stripe(fraction, radius)
    fun back(level: Int, radius: Float): Drawable = GradientDrawable().apply { cornerRadius = radius; setColor(if(level == 1) deck1 else deck2); setStroke(dp(1).coerceAtLeast(1), line) }
    /** Gold chip; a void card shows it as a flat line-coloured block. [unit] is pixels per CSS px. */
    fun chip(void: Boolean, unit: Float): Drawable = CardChip(if(void) line else null, unit)
    fun lamp(tone: String): Drawable = Lamp(tone)
    fun miniCard(on: Boolean): Drawable = MiniCard(on, faceA, faceB, line, faint, density)
    /** .note: outline only; gold and bad variants colour the border. */
    fun note(kind: String): Drawable = rounded(5f, Color.TRANSPARENT, when(kind) { "gold" -> gold; "bad" -> danger; else -> line })
    fun noteColor(kind: String) = when(kind) { "gold" -> goldText; "bad" -> danger; else -> secondary }
    /** .badge: outline tag; the campus-auth tag is gold. */
    fun badge(auth: Boolean): Drawable = rounded(4f, Color.TRANSPARENT, if(auth) gold else line)
    /** .seg: field with a line border around the level buttons. */
    fun seg(): Drawable = rounded(8f, fieldFill, line).apply { setPadding(dp(3), dp(3), dp(3), dp(3)) }
    /** A level segment: ink fill when checked. */
    fun segment(on: Boolean): Drawable = pressable(rounded(5f, if(on) ink else Color.TRANSPARENT), 5f)
    fun icon(kind: String, tint: Int, size: Int = 18) = NetMateIcon(kind, tint, dp(size))
    /** Tab icon: gold when selected, rail-text-2 otherwise. */
    fun tabIcon(kind: String, active: Boolean) = NetMateIcon(kind, if(active) gold else railText2, dp(22))
    private fun color(value: String) = Color.parseColor(value)
}

/** CSS linear-gradient(angle) over a rectangle: 0° points up, 90° right. */
private fun angled(left: Float, top: Float, width: Float, height: Float, degrees: Float, colors: IntArray, stops: FloatArray? = null): LinearGradient {
    val radians = Math.toRadians(degrees.toDouble()); val dx = sin(radians).toFloat(); val dy = -cos(radians).toFloat()
    val half = abs(width/2*dx) + abs(height/2*dy); val cx = left + width/2; val cy = top + height/2
    return LinearGradient(cx - dx*half, cy - dy*half, cx + dx*half, cy + dy*half, colors, stops, Shader.TileMode.CLAMP)
}
private fun hex(value: String) = Color.parseColor(value)
/** The card chip's gold: linear-gradient(135deg, #ecd48c, #b88f35). */
private val CHIP_GOLD = intArrayOf(0xffecd48c.toInt(), 0xffb88f35.toInt())

/** .id-card: 135° face gradient, radius 16 and a 1px inner highlight on top; a void card is a 1.5px dashed outline. */
internal class CardFace(private val void: Boolean, private val a: Int, private val b: Int, private val dash: Int, private val radius: Float,
    private val density: Float) : Drawable() {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val other = Paint(Paint.ANTI_ALIAS_FLAG)
    private val border = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeWidth = 1.5f*density; color = dash
        pathEffect = DashPathEffect(floatArrayOf(4.5f*density, 3f*density), 0f)
    }
    private val rect = RectF()
    private val shape = Path()
    override fun onBoundsChange(bounds: Rect) {
        rect.set(bounds)
        shape.rewind(); shape.addRoundRect(rect, radius, radius, Path.Direction.CW)
        paint.shader = if(void) null else angled(rect.left, rect.top, rect.width(), rect.height(), 135f, intArrayOf(a, b))
    }
    override fun draw(canvas: Canvas) {
        if(void) {
            val w = border.strokeWidth/2
            canvas.drawRoundRect(rect.left + w, rect.top + w, rect.right - w, rect.bottom - w, radius - w, radius - w, border)
        } else canvas.drawRoundRect(rect, radius, radius, paint)
        if(void) return
        val save = canvas.save(); canvas.clipPath(shape)
        other.color = 0x0fffffff; canvas.drawRect(rect.left, rect.top, rect.right, rect.top + density, other)
        canvas.restoreToCount(save)
    }
    override fun getOutline(outline: Outline) { outline.setRoundRect(bounds, radius) }
    override fun setAlpha(alpha: Int) { paint.alpha = alpha }
    override fun setColorFilter(filter: ColorFilter?) { paint.colorFilter = filter }
    @Deprecated("Deprecated in Java") override fun getOpacity() = PixelFormat.TRANSLUCENT
}

/** .chip: 46×34 gold block (radius 7) with a pad outline (inset 8/15, radius 3) and a contact line 16px down. */
internal class CardChip(private val flat: Int?, private val unit: Float) : Drawable() {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = unit; color = 0x61503a0e }
    private val rect = RectF()
    override fun onBoundsChange(bounds: Rect) {
        rect.set(bounds)
        if(flat == null) paint.shader = angled(rect.left, rect.top, rect.width(), rect.height(), 135f, CHIP_GOLD) else { paint.shader = null; paint.color = flat }
    }
    override fun draw(canvas: Canvas) {
        val r = 7f*unit; canvas.drawRoundRect(rect, r, r, paint)
        if(flat != null) return
        val h = unit/2
        canvas.drawRoundRect(rect.left + 15f*unit + h, rect.top + 8f*unit + h, rect.right - 15f*unit - h, rect.bottom - 8f*unit - h, 3f*unit, 3f*unit, stroke)
        val y = rect.top + 16f*unit + h
        canvas.drawLine(rect.left, y, rect.right, y, stroke)
    }
    override fun setAlpha(alpha: Int) { paint.alpha = alpha }
    override fun setColorFilter(filter: ColorFilter?) { paint.colorFilter = filter }
    @Deprecated("Deprecated in Java") override fun getOpacity() = PixelFormat.TRANSLUCENT
}

/** .lamp: a 12px dot inside a 5px ring at 20% (warn and bad 22%); the bounds hold the whole 22px ring. */
internal class Lamp(tone: String) : Drawable() {
    private val core = when(tone) { "ok" -> 0xff5cc795.toInt(); "warn" -> 0xffe8a94e.toInt(); "bad" -> 0xfff07b6e.toInt(); else -> 0xff9aa1a7.toInt() }
    private val ring = (core and 0x00ffffff) or ((if(tone == "warn" || tone == "bad") 56 else 51) shl 24)
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    override fun draw(canvas: Canvas) {
        val r = bounds.width()/2f; val cx = bounds.exactCenterX(); val cy = bounds.exactCenterY()
        paint.color = ring; canvas.drawCircle(cx, cy, r, paint)
        paint.color = core; canvas.drawCircle(cx, cy, r*6f/11f, paint)
    }
    override fun setAlpha(alpha: Int) { paint.alpha = alpha }
    override fun setColorFilter(filter: ColorFilter?) { paint.colorFilter = filter }
    @Deprecated("Deprecated in Java") override fun getOpacity() = PixelFormat.TRANSLUCENT
}

/** .mini-card: 58×38, radius 6, face gradient with a gold 14×10 chip at (7, 9); off = line fill with a faint chip. */
internal class MiniCard(private val on: Boolean, private val a: Int, private val b: Int, private val off: Int, private val offChip: Int, private val density: Float) : Drawable() {
    private val face = Paint(Paint.ANTI_ALIAS_FLAG)
    private val chip = Paint(Paint.ANTI_ALIAS_FLAG)
    private val rect = RectF()
    override fun onBoundsChange(bounds: Rect) {
        rect.set(bounds); val d = density
        if(on) {
            face.shader = angled(rect.left, rect.top, rect.width(), rect.height(), 135f, intArrayOf(a, b))
            chip.shader = angled(rect.left + 7*d, rect.top + 9*d, 14*d, 10*d, 135f, CHIP_GOLD)
        } else { face.shader = null; face.color = off; chip.shader = null; chip.color = offChip }
    }
    override fun draw(canvas: Canvas) {
        val d = density
        canvas.drawRoundRect(rect, 6*d, 6*d, face)
        canvas.drawRoundRect(rect.left + 7*d, rect.top + 9*d, rect.left + 21*d, rect.top + 19*d, 2*d, 2*d, chip)
    }
    override fun getIntrinsicWidth() = (58*density+.5f).toInt(); override fun getIntrinsicHeight() = (38*density+.5f).toInt()
    override fun setAlpha(alpha: Int) { face.alpha = alpha }
    override fun setColorFilter(filter: ColorFilter?) { face.colorFilter = filter }
    @Deprecated("Deprecated in Java") override fun getOpacity() = PixelFormat.TRANSLUCENT
}

/** .brand-card: a 30×21 card (radius 4, 1px white 8% inner border) with a 9×7 gold chip at (5, 6). */
internal class BrandCard(private val density: Float) : Drawable() {
    private val face = Paint(Paint.ANTI_ALIAS_FLAG)
    private val chip = Paint(Paint.ANTI_ALIAS_FLAG)
    private val edge = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = density; color = 0x14ffffff }
    private val rect = RectF()
    override fun onBoundsChange(bounds: Rect) {
        rect.set(bounds); val d = density
        face.shader = angled(rect.left, rect.top, rect.width(), rect.height(), 135f, intArrayOf(hex("#3a4651"), hex("#2a333c")))
        chip.shader = angled(rect.left + 5*d, rect.top + 6*d, 9*d, 7*d, 135f, CHIP_GOLD)
    }
    override fun draw(canvas: Canvas) {
        val d = density; val h = d/2
        canvas.drawRoundRect(rect, 4*d, 4*d, face)
        canvas.drawRoundRect(rect.left + h, rect.top + h, rect.right - h, rect.bottom - h, 3.5f*d, 3.5f*d, edge)
        canvas.drawRoundRect(rect.left + 5*d, rect.top + 6*d, rect.left + 14*d, rect.top + 13*d, 2*d, 2*d, chip)
    }
    override fun getIntrinsicWidth() = (30*density+.5f).toInt(); override fun getIntrinsicHeight() = (21*density+.5f).toInt()
    override fun setAlpha(alpha: Int) { face.alpha = alpha }
    override fun setColorFilter(filter: ColorFilter?) { face.colorFilter = filter }
    @Deprecated("Deprecated in Java") override fun getOpacity() = PixelFormat.TRANSLUCENT
}

/** Stroke icons of design/app.js (24×24 viewBox, stroke 2, round caps). */
internal class NetMateIcon(private val kind: String, private val color: Int, private val size: Int, private val rotation: Float = 0f) : Drawable() {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 2f; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
    private fun Path.arc(cx: Float, cy: Float, r: Float, start: Float, sweep: Float) = arcTo(cx - r, cy - r, cx + r, cy + r, start, sweep, true)
    override fun draw(canvas: Canvas) {
        val save = canvas.save(); canvas.translate(bounds.left.toFloat(), bounds.top.toFloat()); canvas.scale(bounds.width()/24f, bounds.height()/24f)
        if(rotation != 0f) canvas.rotate(rotation, 12f, 12f)
        paint.color = color; val p = Path()
        when(kind) {
            "运行状态", "wifi" -> {
                p.arc(12f, 21f, 11f, -129.8f, 79.6f); p.arc(12f, 21f, 6f, -125.4f, 70.8f)
                if(kind == "运行状态") p.arc(12f, 21f, 16f, -131.4f, 82.8f)
                canvas.drawCircle(12f, 20f, 1f, paint)
            }
            "配置设置" -> {
                for((x, a, b) in listOf(Triple(4f, 14f, 10f), Triple(12f, 12f, 8f), Triple(20f, 16f, 12f))) { p.moveTo(x, 21f); p.lineTo(x, a); p.moveTo(x, b); p.lineTo(x, 3f) }
                p.moveTo(1f, 14f); p.lineTo(7f, 14f); p.moveTo(9f, 8f); p.lineTo(15f, 8f); p.moveTo(17f, 16f); p.lineTo(23f, 16f)
            }
            "refresh" -> { p.arc(12f, 12f, 9f, 0f, 315f); p.lineTo(21f, 8f); p.moveTo(21f, 3f); p.lineTo(21f, 8f); p.lineTo(16f, 8f) }
            "search" -> { canvas.drawCircle(11f, 11f, 7f, paint); p.moveTo(20f, 20f); p.lineTo(16.5f, 16.5f) }
            "check" -> { p.moveTo(20f, 6f); p.lineTo(9f, 17f); p.lineTo(4f, 12f) }
            "chevron" -> { p.moveTo(6f, 9f); p.lineTo(12f, 15f); p.lineTo(18f, 9f) }
            else -> {
                p.moveTo(14f, 2f); p.lineTo(6f, 2f); p.quadTo(4f, 2f, 4f, 4f); p.lineTo(4f, 20f); p.quadTo(4f, 22f, 6f, 22f); p.lineTo(18f, 22f); p.quadTo(20f, 22f, 20f, 20f); p.lineTo(20f, 8f); p.close()
                p.moveTo(14f, 2f); p.lineTo(14f, 8f); p.lineTo(20f, 8f); p.moveTo(8f, 13f); p.lineTo(16f, 13f); p.moveTo(8f, 17f); p.lineTo(13f, 17f)
            }
        }
        canvas.drawPath(p, paint); canvas.restoreToCount(save)
    }
    override fun getIntrinsicWidth() = size; override fun getIntrinsicHeight() = size
    override fun setAlpha(alpha: Int) { paint.alpha = alpha }
    override fun setColorFilter(filter: ColorFilter?) { paint.colorFilter = filter }
    @Deprecated("Deprecated in Java") override fun getOpacity() = PixelFormat.TRANSLUCENT
}

/** Lays children left to right and wraps onto new lines, like the GTK flow box used for notes and actions. */
internal class FlowRow(context: Context, private val gap: Int, private val lineGap: Int) : ViewGroup(context) {
    override fun onMeasure(widthSpec: Int, heightSpec: Int) {
        val limit = if(MeasureSpec.getMode(widthSpec) == MeasureSpec.UNSPECIFIED) Int.MAX_VALUE else MeasureSpec.getSize(widthSpec) - paddingLeft - paddingRight
        var x = 0; var y = 0; var line = 0; var widest = 0
        for(i in 0 until childCount) {
            val child = getChildAt(i); if(child.visibility == GONE) continue
            measureChild(child, widthSpec, heightSpec)
            if(x > 0 && x + child.measuredWidth > limit) { y += line + lineGap; x = 0; line = 0 }
            x += child.measuredWidth; widest = maxOf(widest, x); x += gap
            line = maxOf(line, child.measuredHeight)
        }
        setMeasuredDimension(resolveSize(widest + paddingLeft + paddingRight, widthSpec), resolveSize(y + line + paddingTop + paddingBottom, heightSpec))
    }
    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        val limit = r - l - paddingLeft - paddingRight
        var x = 0; var y = 0; var line = 0
        for(i in 0 until childCount) {
            val child = getChildAt(i); if(child.visibility == GONE) continue
            if(x > 0 && x + child.measuredWidth > limit) { y += line + lineGap; x = 0; line = 0 }
            child.layout(paddingLeft + x, paddingTop + y, paddingLeft + x + child.measuredWidth, paddingTop + y + child.measuredHeight)
            x += child.measuredWidth + gap; line = maxOf(line, child.measuredHeight)
        }
    }
    override fun generateDefaultLayoutParams() = LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT)
}

/**
 * Lays its one child out at the design size (the 456×298dp card deck of linux.rs `account_card`) and scales it down to
 * the available width, so the face keeps 440:276 and every proportion inside it on a phone. The scale is recomputed on
 * every measure, so rotation and window resizes need no rebuild.
 */
internal class FitWidth(context: Context, private val designWidth: Int, private val designHeight: Int) : ViewGroup(context) {
    override fun onMeasure(widthSpec: Int, heightSpec: Int) {
        val child = getChildAt(0)
        child?.measure(MeasureSpec.makeMeasureSpec(designWidth, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(designHeight, MeasureSpec.EXACTLY))
        val width = if(MeasureSpec.getMode(widthSpec) == MeasureSpec.UNSPECIFIED) designWidth else MeasureSpec.getSize(widthSpec)
        val scale = minOf(1f, width.toFloat()/designWidth)
        child?.let { if(it.scaleX != scale) { it.pivotX = 0f; it.pivotY = 0f; it.scaleX = scale; it.scaleY = scale } }
        setMeasuredDimension(width, (designHeight*scale + .5f).toInt())
    }
    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) { getChildAt(0)?.layout(0, 0, designWidth, designHeight) }
}

/**
 * The magnetic stripe at the card's foot; it shows retry progress. The view spans the face's full width at its bottom
 * edge, so a clip whose bottom corners match the card's radius keeps the stripe inside the rounded corners.
 */
internal class Stripe(private val fraction: Float, private val radius: Float) : Drawable() {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val shape = Path()
    override fun onBoundsChange(bounds: Rect) {
        shape.rewind(); shape.addRoundRect(bounds.left.toFloat(), bounds.bottom - 3*radius, bounds.right.toFloat(), bounds.bottom.toFloat(), radius, radius, Path.Direction.CW)
    }
    override fun draw(canvas: Canvas) {
        val b = bounds; val save = canvas.save(); canvas.clipPath(shape)
        paint.color = 0x14ffffff; canvas.drawRect(b, paint)
        paint.color = 0xffe8a94e.toInt(); canvas.drawRect(b.left.toFloat(), b.top.toFloat(), b.left + b.width()*fraction.coerceIn(0f, 1f), b.bottom.toFloat(), paint)
        canvas.restoreToCount(save)
    }
    override fun setAlpha(alpha: Int) { paint.alpha = alpha }
    override fun setColorFilter(filter: ColorFilter?) { paint.colorFilter = filter }
    @Deprecated("Deprecated in Java") override fun getOpacity() = PixelFormat.TRANSLUCENT
}

/** The pen's switch at 16dp per em: 5.625em × 2.5em; the view adds 3dp around it for the outer highlight. */
private const val TOGGLE_EM = 16f
private const val TOGGLE_W = 5.625f
private const val TOGGLE_H = 2.5f
private const val SUN_D = 2.125f
private const val SUN_OFFSET = (TOGGLE_H - SUN_D)/2f
/** While hovered by a mouse the sun leans 0.187em towards the middle. */
private const val SUN_LEAN = .187f
/** Every transition in the pen is `0.3s ease`. */
private const val SWITCH_MS = 300f
/** The pen's cloud: a 1.25em circle and its box-shadow copies, (x, y, spread) in em from the circle's centre. */
private val CLOUD_FRONT = floatArrayOf(0f, 0f, 0f, .937f, .312f, 0f, 1.437f, .375f, 0f, 2.187f, 0f, 0f, 2.937f, .312f, 0f, 3.625f, -.062f, 0f, 4.5f, -.312f, 0f, 4.625f, -1.75f, .437f)
private val CLOUD_BACK = floatArrayOf(-.312f, -.312f, 0f, .5f, -.125f, 0f, 1.25f, -.062f, 0f, 2f, -.312f, 0f, 2.625f, 0f, 0f, 3.375f, -.437f, 0f, 4f, -.625f, 0f, 4.125f, -2.125f, .437f)
/** Centres of the seven sparkles in the pen's star SVG (viewBox 144×55). */
private val SPARKLES = floatArrayOf(136.996f, 4.3545f, 34.9956f, 23.3545f, 3.9956f, 36.3545f, 57.9956f, 25.3545f, 84.9956f, 25.3545f, 139.996f, 36.3545f, 102.996f, 50.3545f)
/** One sparkle as cubic segments around its centre, starting from the left tip (-3.9956, 0). */
private val SPARKLE = floatArrayOf(
    -2.8842f, -.055f, -1.9405f, -.5042f, -1.1643f, -1.3476f,
    -.3881f, -2.191f, 0f, -3.1903f, 0f, -4.3545f,
    0f, -3.1903f, .3881f, -2.191f, 1.1643f, -1.3476f,
    1.9405f, -.5042f, 2.8842f, -.0642f, 4.0044f, 0f,
    3.2723f, .0366f, 2.602f, .2475f, 1.9846f, .6508f,
    1.376f, 1.045f, .8908f, 1.5767f, .5292f, 2.2368f,
    .1764f, 2.8968f, 0f, 3.6027f, 0f, 4.3728f,
    0f, 3.2085f, -.3881f, 2.2001f, -1.1643f, 1.3567f,
    -1.9405f, .5042f, -2.8842f, .055f, -3.9956f, 0f)
/** Moon craters: (left, top, size) in em inside the moon mask. */
private val CRATERS = floatArrayOf(.3f, .75f, .75f, 1.375f, .9f, .375f, .8f, .3f, .25f)
/** Sun halo rings: box-shadow spreads, painted largest first. */
private val HALOS = floatArrayOf(1.875f, 1.25f, .625f)

private fun knobX(night: Boolean, hover: Boolean): Float {
    val lean = if(hover) SUN_LEAN else 0f
    return if(night) TOGGLE_W - SUN_D - SUN_OFFSET - lean else SUN_OFFSET + lean
}
/** CSS `ease` (cubic-bezier(0.25, 0.1, 0.25, 1)), solved by bisection as in linux.rs. */
private fun cssEase(t: Float): Float {
    fun curve(a: Float, b: Float, s: Float) = 3f*(1f - s)*(1f - s)*s*a + 3f*(1f - s)*s*s*b + s*s*s
    var lo = 0f; var hi = 1f
    repeat(24) { val mid = (lo + hi)/2f; if(curve(.25f, .25f, mid) < t) lo = mid else hi = mid }
    return curve(.1f, 1f, (lo + hi)/2f)
}
private fun mix(a: Int, b: Int, k: Float): Int {
    fun channel(shift: Int): Int { val x = (a shr shift) and 255; val y = (b shr shift) and 255; return (x + (y - x)*k + .5f).toInt() }
    return Color.rgb(channel(16), channel(8), channel(0))
}

/**
 * A CSS transition: retargeting starts a fresh 0.3 s run from the current value, as a browser does when a transition
 * is interrupted.
 */
private class Tween(start: Float) {
    var from = start
    var to = start
    var value = start
    var started = -1L
    val moving: Boolean get() = value != to
    fun set(target: Float) { if(to != target) { from = value; to = target; started = -1L } }
    fun snap() { value = to; from = to; started = -1L }
    fun step(now: Long) {
        if(!moving) return
        if(started < 0) started = now
        val k = ((now - started)/SWITCH_MS).coerceIn(0f, 1f)
        value = from + (to - from)*cssEase(k)
        if(k >= 1f) snap()
    }
}

/**
 * Day/night switch ported from `draw_toggle` in apps/native-ui/src/linux.rs (CodePen "Animated Day/Night Theme Toggle",
 * kept as design/toggle-pen.html), drawn in the pen's em units: the sun knob slides right while a moon mask slides over
 * it, the clouds sink away and the stars drop in. Every move is a 0.3 s CSS `ease` [Tween].
 *
 * Frames are scheduled with postOnAnimation only while a tween moves; there is no idle motion. With animator duration
 * scale 0, or when the view is detached, the switch jumps to its end state. [stop] ends a running transition at once.
 * Paints and paths are built once and onDraw allocates nothing.
 */
internal class DayNightToggle @JvmOverloads constructor(context: Context, attrs: AttributeSet? = null) : View(context, attrs) {
    private var night = true
    private var hover = false
    /** Day 0 .. night 1: background colour, clouds, stars and the moon mask. */
    private val scene = Tween(1f)
    /** The sun's left edge in em, hover lean included. */
    private val knob = Tween(knobX(true, false))
    private var ticking = false
    private val frame = object : Runnable {
        override fun run() {
            val now = AnimationUtils.currentAnimationTimeMillis()
            scene.step(now); knob.step(now); invalidate()
            if(scene.moving || knob.moving) postOnAnimation(this) else ticking = false
        }
    }
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = .125f }
    /** Reused for shadow layers and clip shapes. */
    private val shape = Path()
    private val clip = Path()
    private val stars = Path().apply {
        for(i in SPARKLES.indices step 2) {
            val x = SPARKLES[i]; val y = SPARKLES[i + 1]
            moveTo(x - 3.9956f, y)
            for(j in SPARKLE.indices step 6) cubicTo(x + SPARKLE[j], y + SPARKLE[j + 1], x + SPARKLE[j + 2], y + SPARKLE[j + 3], x + SPARKLE[j + 4], y + SPARKLE[j + 5])
            close()
        }
    }

    init { isClickable = true; isFocusable = true }

    /** Moves to the given theme; without animation (first layout, detached, or animator duration scale 0) it jumps. */
    fun setNight(value: Boolean, animate: Boolean) { night = value; retarget(animate) }

    /** Ends any transition at its end state; nothing stays scheduled. */
    fun stop() { removeCallbacks(frame); ticking = false; scene.snap(); knob.snap(); invalidate() }

    private fun retarget(animate: Boolean) {
        scene.set(if(night) 1f else 0f); knob.set(knobX(night, hover))
        if(!animate || !isAttachedToWindow || !ValueAnimator.areAnimatorsEnabled()) { stop(); return }
        if(!ticking && (scene.moving || knob.moving)) { ticking = true; postOnAnimation(frame) }
    }

    /** The lean follows a mouse pointer only; touch exploration and stylus hover leave the knob where it is. */
    override fun onHoverEvent(event: MotionEvent): Boolean {
        val inside = event.isFromSource(InputDevice.SOURCE_MOUSE) && event.actionMasked != MotionEvent.ACTION_HOVER_EXIT
        if(inside != hover) { hover = inside; retarget(true) }
        return super.onHoverEvent(event)
    }
    override fun onDetachedFromWindow() { stop(); super.onDetachedFromWindow() }
    override fun drawableStateChanged() { super.drawableStateChanged(); invalidate() }
    override fun getAccessibilityClassName(): CharSequence = android.widget.Button::class.java.name

    private fun pill(path: Path, x: Float, y: Float, w: Float, h: Float) { val r = minOf(w, h)/2f; path.addRoundRect(x, y, x + w, y + h, r, r, Path.Direction.CW) }

    /**
     * CSS `box-shadow` on a pill (a circle when square), as six stacked layers whose edges spread over ±[blur]. An inset
     * shadow fills the area outside the shape.
     */
    private fun softShadow(canvas: Canvas, x: Float, y: Float, w: Float, h: Float, blur: Float, color: Int, alpha: Float, inset: Boolean) {
        val each = 1f - (1f - alpha).pow(1f/6f)
        paint.color = color; paint.alpha = (each*255f + .5f).toInt()
        for(i in 0 until 6) {
            val e = blur*((i + .5f)/6f*2f - 1f)
            shape.rewind(); shape.fillType = Path.FillType.EVEN_ODD
            if(inset) shape.addRect(x - 10f, y - 10f, x + w + 10f, y + h + 10f, Path.Direction.CW)
            pill(shape, x - e, y - e, w + 2f*e, h + 2f*e)
            canvas.drawPath(shape, paint)
        }
    }
    /** `box-shadow: inset ox oy blur color` on the pill (x, y, w, h). */
    private fun insetShadow(canvas: Canvas, x: Float, y: Float, w: Float, h: Float, ox: Float, oy: Float, blur: Float, color: Int, alpha: Float) {
        val save = canvas.save()
        clip.rewind(); pill(clip, x, y, w, h); canvas.clipPath(clip)
        softShadow(canvas, x + ox, y + oy, w, h, blur, color, alpha, true)
        canvas.restoreToCount(save)
    }

    override fun onDraw(canvas: Canvas) {
        val unit = TOGGLE_EM*resources.displayMetrics.density
        val save = canvas.save()
        canvas.translate((width - TOGGLE_W*unit)/2f, (height - TOGGLE_H*unit)/2f); canvas.scale(unit, unit)
        val k = scene.value.coerceIn(0f, 1f)
        // Outer highlight: 0.06em 0.06em 0.125em rgba(255, 255, 255, 0.94).
        softShadow(canvas, .06f, .06f, TOGGLE_W, TOGGLE_H, .125f, Color.WHITE, .94f, false)
        val framed = canvas.save()
        clip.rewind(); pill(clip, 0f, 0f, TOGGLE_W, TOGGLE_H); canvas.clipPath(clip)
        paint.color = mix(0x3d7eae, 0x1d1f2c, k); canvas.drawRect(0f, 0f, TOGGLE_W, TOGGLE_H, paint)
        // Clouds hang from (0.3em, 2em) and sink 3em at night; back puffs paint beneath the front ones.
        val cx = .3f + .625f; val cy = 2f + .625f + 3f*k
        paint.color = 0xffaacadf.toInt()
        for(i in CLOUD_BACK.indices step 3) canvas.drawCircle(cx + CLOUD_BACK[i], cy + CLOUD_BACK[i + 1], .625f + CLOUD_BACK[i + 2], paint)
        paint.color = 0xfff3fdff.toInt()
        for(i in CLOUD_FRONT.indices step 3) canvas.drawCircle(cx + CLOUD_FRONT[i], cy + CLOUD_FRONT[i + 1], .625f + CLOUD_FRONT[i + 2], paint)
        // Stars: 2.75em wide at 0.3em; 2em above the frame by day, 0.5em down at night.
        val starred = canvas.save()
        canvas.translate(.3f, -2f + 2.5f*k); canvas.scale(2.75f/144f, 2.75f/144f)
        paint.color = Color.WHITE; canvas.drawPath(stars, paint)
        canvas.restoreToCount(starred)
        // Sun: the halo rings go under the drop shadows.
        val sunX = knob.value; val sunY = SUN_OFFSET; val r = SUN_D/2f; val sx = sunX + r; val sy = sunY + r
        paint.color = Color.WHITE; paint.alpha = 26
        for(spread in HALOS) canvas.drawCircle(sx, sy, r + spread, paint)
        softShadow(canvas, sunX, sunY + .05f, SUN_D, SUN_D, .125f, Color.BLACK, .25f, false)
        softShadow(canvas, sunX + .05f, sunY + .125f, SUN_D, SUN_D, .125f, Color.BLACK, .25f, false)
        paint.color = 0xffecca2f.toInt(); canvas.drawCircle(sx, sy, r, paint)
        insetShadow(canvas, sunX, sunY, SUN_D, SUN_D, 0f, -.05f, .05f, 0xffa1872a.toInt(), 1f)
        insetShadow(canvas, sunX, sunY, SUN_D, SUN_D, .05f, .05f, .05f, 0xfffeffef.toInt(), .61f)
        // Moon mask: slides in from the right, clipped to the sun's circle.
        val masked = canvas.save()
        clip.rewind(); clip.addCircle(sx, sy, r, Path.Direction.CW); canvas.clipPath(clip)
        val mx = sunX + SUN_D*(1f - k); val my = sunY
        paint.color = 0xffc4c9d1.toInt(); canvas.drawCircle(mx + r, my + r, r, paint)
        insetShadow(canvas, mx, my, SUN_D, SUN_D, 0f, -.062f, .062f, 0xff969696.toInt(), 1f)
        insetShadow(canvas, mx, my, SUN_D, SUN_D, .062f, .062f, .062f, 0xfffeffef.toInt(), .61f)
        for(i in CRATERS.indices step 3) {
            val left = mx + CRATERS[i]; val top = my + CRATERS[i + 1]; val size = CRATERS[i + 2]
            paint.color = 0xff959db1.toInt(); canvas.drawCircle(left + size/2f, top + size/2f, size/2f, paint)
            insetShadow(canvas, left, top, size, size, 0f, .03f, .06f, Color.BLACK, .25f)
        }
        canvas.restoreToCount(masked)
        // The container's ::after: inset 0 0.05em 0.187em rgba(0, 0, 0, 0.5).
        insetShadow(canvas, 0f, 0f, TOGGLE_W, TOGGLE_H, 0f, .05f, .187f, Color.BLACK, .5f)
        canvas.restoreToCount(framed)
        // Keyboard focus: a gold outline just outside the switch, inside the 3dp margin.
        if(isFocused && !isInTouchMode) {
            ring.color = mix(0xc9a24a, 0xd9b85e, k)
            val o = .125f; val rr = (TOGGLE_H + 2*o)/2f
            canvas.drawRoundRect(-o, -o, TOGGLE_W + o, TOGGLE_H + o, rr, rr, ring)
        }
        canvas.restoreToCount(save)
    }
}

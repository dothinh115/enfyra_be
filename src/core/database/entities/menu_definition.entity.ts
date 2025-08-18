import { Entity, Unique, Index, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, OneToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Extension_definition } from './extension_definition.entity';

@Entity('menu_definition')
@Unique(['label', 'type'])
@Unique(['label', 'sidebar', 'type'])
@Unique(['path'])
@Index(['order'])
export class Menu_definition {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "text", nullable: true })
    description: string;
    @Column({ type: "varchar", nullable: false, default: "lucide:menu" })
    icon: string;
    @Column({ type: "boolean", nullable: false, default: true })
    isEnabled: boolean;
    @Column({ type: "boolean", nullable: false, default: false })
    isSystem: boolean;
    @Column({ type: "varchar", nullable: false })
    label: string;
    @Column({ type: "int", nullable: false, default: 0 })
    order: number;
    @Column({ type: "varchar", nullable: false })
    path: string;
    @Column({ type: "simple-json", nullable: true })
    permission: any;
    @Column({ type: "enum", nullable: false, enum: ['mini', 'menu'] })
    type: 'mini' | 'menu';
    @Index()
    @ManyToOne('Menu_definition', (rel: any) => rel.children, { nullable: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
    @JoinColumn()
    parent: any;
    @Index()
    @ManyToOne('Menu_definition', (rel: any) => rel.menus, { nullable: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
    @JoinColumn()
    sidebar: any;
    @OneToMany('Menu_definition', (rel: any) => rel.parent, { cascade: true })
    children: any;
    @OneToMany('Menu_definition', (rel: any) => rel.sidebar, { cascade: true })
    menus: any;
    @OneToOne('Extension_definition', (rel: any) => rel.menu)
    extension: any;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
